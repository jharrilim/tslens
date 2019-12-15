import { TSLensConfiguration } from '../classes/ts-lens-configuration';
import * as Introspection from '../classes/introspection';
import vscode, {
  CodeLensProvider,
  Range,
  window,
  TextDocument,
  CancellationToken,
  CodeLens,
  commands,
  SymbolInformation,
  SymbolKind,
  Location,
  ExtensionContext,
  Uri,
} from 'vscode';
import {
  Project,
  ClassDeclaration,
  ClassMemberTypes,
  InterfaceDeclaration,
  ExpressionWithTypeArguments,
  PropertySignature,
  MethodSignature,
  PropertyDeclaration,
  MethodDeclaration,
  TypeElementTypes,
  SourceFile,
  NamespaceDeclaration
} from 'ts-morph';

import minimatch from 'minimatch';
import * as enu from 'linq';
import { AppConfiguration } from '../classes/app-configuration';
import { MethodReferenceLens } from '../classes/method-reference-lens';
import { TSDecoration } from '../classes/ts-decoration';
import { MethodReferenceLensProvider } from '../provider';

export class TSCodeLensProvider implements CodeLensProvider {
  public static methods = new Map<string, string>();

  private overrideDecorations = new Map<string, TSDecoration>();

  private classCache = new Map<string, Array<ClassMemberTypes | TypeElementTypes>>();
  private interfaces: Array<InterfaceDeclaration> = [];
  private recheckInterfaces = true;

  constructor(
    private config: AppConfiguration,
    private provider: MethodReferenceLensProvider,
    private context: ExtensionContext
  ) {
    this.initInterfaces();
  }

  initInterfaces(): void {
    setTimeout(() => {
      this.interfaces = Introspection.getInterfaces(this.config.project);
    }, 1000);
  }

  clearDecorations(declarationSet: Map<string, TSDecoration>): void {
    const editor: vscode.TextEditor = window.activeTextEditor;
    if (editor === undefined)
      return;

    const keys = [];
    declarationSet.forEach(({ ranges, decoration }, key) => {
      if (key.startsWith(editor.document.uri.fsPath)
        && ranges.length > 0
        && decoration
      ) {
        decoration.dispose();
        decoration = null;
        keys.push(key);
      }
    });
    keys.forEach(x => declarationSet.delete(x));
  }


  private async setupCodeLens(
    codeLens: CodeLens,
    analyzeSymbols?: boolean
  ): Promise<boolean> {
    if (codeLens instanceof MethodReferenceLens) {
      const file: SourceFile = this.config.project.getSourceFile(
        window.activeTextEditor.document.fileName
      );

      if (!file) {
        return false;
      }

      TSCodeLensProvider.methods = new Map();
      const testName: string = window.activeTextEditor.document.getText(
        codeLens.range
      );

      let isChanged: boolean = codeLens.isChanged;
      let symbol: SymbolInformation = codeLens.symbol;

      let locations: Location[];
      let symbols: SymbolInformation[];

      if (analyzeSymbols) {
        const res: [Location[], SymbolInformation[]] = await Promise.all([
          commands.executeCommand<Location[]>(
            'vscode.executeReferenceProvider',
            codeLens.uri,
            codeLens.range.start
          ),
          commands.executeCommand<SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            codeLens.uri
          )
        ]);

        locations = res[0];
        symbols = Introspection.symbolsAggregator(window.activeTextEditor.document, {}, res[1]);

        if (this.recheckInterfaces) {
          this.initInterfaces();
          this.recheckInterfaces = false;
        }

        const settings: TSLensConfiguration = this.config.settings;

        const filteredLocations: Location[] = settings.excludeself
          ? locations.filter(location => !location.range.isEqual(codeLens.range))
          : locations;

        const blackboxList: string[] = this.config.settings.blackbox || [];
        const nonBlackBoxedLocations: Location[] = filteredLocations.filter(
          location => {
            const fileName: string = location.uri.path;
            return !blackboxList.some(pattern => {
              return new minimatch.Minimatch(pattern).match(fileName);
            });
          }
        );

        isChanged = Introspection.checkInterfaces(this.config.project,
          nonBlackBoxedLocations.map(x => x.uri.fsPath).concat(
            file.getImportDeclarations().reduce<string[]>((locations, importDeclaration) => {
              const moduleFile = importDeclaration.getModuleSpecifierSourceFile();
              return moduleFile ? locations.concat(moduleFile.getFilePath()) : locations;
            }, [])

          ));

        symbol = symbols.find(x =>
          x.location.range.start.line === codeLens.range.start.line
          && testName === x.name
        );
      }

      if (this.config.project && symbol) {
        if (
          symbol.kind === SymbolKind.Method ||
          symbol.kind === SymbolKind.Field ||
          symbol.kind === SymbolKind.Property
        ) {
          const namespaces: NamespaceDeclaration[] = file.getNamespaces();
          const parentClass: ClassDeclaration = namespaces.length > 0
            ? namespaces
              .map(namespace => namespace.getClass(symbol.containerName))
              .find(classDeclaration => !!classDeclaration)
            : file.getClass(symbol.containerName);

          if (parentClass) {
            let members: Array<ClassMemberTypes | TypeElementTypes> = [];
            const key: string = `${parentClass.getName()}_${parentClass
              .getSourceFile()
              .getFilePath()}`;
            if (this.classCache.has(key) && !isChanged) {
              members = this.classCache.get(key);
            } else {
              try {
                members = Introspection.getClassMembers(this.interfaces, parentClass);
                this.classCache.set(key, members);
              } catch (error) {
                console.log(error);
              }
            }

            const classMembers = members.filter(member =>
              member instanceof PropertyDeclaration
              || member instanceof MethodDeclaration
            ) as Array<PropertyDeclaration | MethodDeclaration>;

            const interfaceMembers = members.filter(x =>
              x instanceof PropertySignature
              || x instanceof MethodSignature
            ) as Array<PropertySignature | MethodSignature>;

            const classInd = classMembers.filter(x => x.getName() === testName);
            const interfaceInd = interfaceMembers.filter(x => x.getName() === testName);

            const isClassed: boolean = classInd.length > 0;
            const isInterface: boolean = interfaceInd.length > 0;

            if (symbol.kind === SymbolKind.Method && isClassed) {
              const key: string = `${symbol.location.uri.fsPath}_${
                symbol.location.range.start.line
                }`;
              TSCodeLensProvider.methods.set(key, classInd[0].getText());
            }

            if (isClassed || isInterface) {
              codeLens.isClassed = isClassed;
              codeLens.isInterface = isInterface;
              codeLens.interfaceInd = interfaceInd;
              codeLens.classInd = classInd;
              codeLens.testName = testName;
              codeLens.symbol = symbol;
              codeLens.isChanged = isChanged;
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
    const codeLenses = await this.provider(document, token);
    if (!this.config.settings.showBaseMemberInfo) {
      return [];
    }

    const filterAsync = (array: MethodReferenceLens[], filter: (x: MethodReferenceLens) => Promise<boolean>) =>
      Promise.all(
        array.map(entry => filter(entry)))
        .then(bits =>
          array.filter(_ => bits.shift())
        );

    const f: MethodReferenceLens[] = await filterAsync(
      codeLenses,
      lens => this.setupCodeLens(lens, true)
    );
    this.clearDecorations(this.overrideDecorations);
    return f;
  }

  async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
    if (
      !(codeLens instanceof MethodReferenceLens)
      || (!await this.setupCodeLens(codeLens))
      || !(codeLens.isClassed || codeLens.isInterface)
      || window.activeTextEditor === undefined
    ) {
      return new CodeLens(codeLens.range, {
        command: '',
        title: ''
      });
    }

    const {
      isClassed,
      isInterface,
      symbol,
      testName,
      classInd,
      interfaceInd,
      uri,
      range,
    } = codeLens;
    const gutterType: string = isClassed
      ? symbol.kind === SymbolKind.Method
        ? isInterface
          ? 'interfaceMethodEdit'
          : 'methodEdit'
        : isInterface
          ? 'interfaceFieldEdit'
          : 'fieldEdit'
      : 'implementInterface';
    const key = [uri.fsPath, range.start.line, testName].join('_');

    const overrideDecoration = this.overrideDecorations.has(key)
      ? this.overrideDecorations.get(key)
      : new TSDecoration();

    overrideDecoration.ranges = [range];
    this.overrideDecorations.set(key, overrideDecoration);

    overrideDecoration.decoration = window.createTextEditorDecorationType({
      backgroundColor: isClassed
        ? symbol.kind === SymbolKind.Method
          ? this.config.settings.methodOverrideColor
          : this.config.settings.fieldOverrideColor
        : this.config.settings.interfaceImplementationColor,
      gutterIconPath: this.context.asAbsolutePath(`images/${gutterType}.svg`)
    });

    overrideDecoration.ranges.push(range);
    let inheritInfo: string = '';
    if (isClassed) {
      inheritInfo = [...new Set(classInd)]
        .map(x => (x['baseClass'] as ClassDeclaration).getName())
        .join(' < ');
    }

    if (isInterface) {
      inheritInfo += isClassed ? ' : ' : '';
      inheritInfo += [...new Set(interfaceInd)].map(intf =>
        intf instanceof InterfaceDeclaration
          ? intf.getName()
          : intf instanceof ExpressionWithTypeArguments
            ? intf.getText()
            : ''
      ).join(' : ');
    }

    overrideDecoration.isClassMember = isClassed;
    overrideDecoration.isInterfaceMember = isInterface;
    overrideDecoration.inheritInfo = inheritInfo;

    this.updateDecorations(codeLens.uri);

    const ref = isClassed ? classInd[0] : interfaceInd[0];
    const firstRef = isClassed ? ref['baseClass'] : ref['interface'];
    const file = firstRef.getSourceFile();

    return new CodeLens(codeLens.range, {
      command: 'tslens.gotoFile',
      arguments: [
        file.getFilePath(),
        file.getLineNumberAtPos(ref.getPos())
      ],
      title: overrideDecoration.inheritInfo
    });
  }

  updateDecorations(uri: Uri) {
    if (uri === window.activeTextEditor.document.uri) {
      this.overrideDecorations.forEach(({ decoration, ranges }, key) => {
        if (key.startsWith(uri.fsPath)) {
          window.activeTextEditor.setDecorations(decoration, ranges);
        }
      });
    }
  }
}
