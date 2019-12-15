import {
  CodeLensProvider,
  Range,
  window,
  TextDocument,
  CancellationToken,
  CodeLens,
  commands,
  Location,
  ExtensionContext,
  Uri,
  Command,
} from 'vscode';

import minimatch from 'minimatch';
import { AppConfiguration } from '../classes/app-configuration';
import { MethodReferenceLens } from '../classes/method-reference-lens';
import { TSDecoration } from '../classes/ts-decoration';
import { MethodReferenceLensProvider } from '../provider';

export class TSCodeRefProvider implements CodeLensProvider {
  private readonly config: AppConfiguration;
  private readonly unusedDecorations = new Map<string, TSDecoration>();
  constructor(
    private readonly provider: MethodReferenceLensProvider,
    private readonly context: ExtensionContext
  ) {
    this.config = new AppConfiguration();
  }

  clearDecorations(decorations: Map<string, TSDecoration>) {
    const editor = window.activeTextEditor;
    if (editor === undefined)
      return;
    const keys = [];
    decorations.forEach((overrideDecoration, key) => {
      if (key.startsWith(editor.document.uri.fsPath)) {
        const decoration = overrideDecoration.decoration;
        const ranges = overrideDecoration.ranges;
        if (ranges.length > 0 && decoration) {
          decoration.dispose();
          keys.push(key);
        }
      }
    });
    keys.forEach(x => decorations.delete(x));
  }

  reinitDecorations() {
    if (window.activeTextEditor !== undefined) {
      this.clearDecorations(this.unusedDecorations);
    }
  }

  async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
    if (!this.config.settings.showReferences)
      return [];
    const lenses = await this.provider(document, token);
    return lenses.filter(lens =>
      !!this.config.settings.referencesTypes.find(z => z === lens.symbol.kind)
    );
  }

  async resolveCodeLens(
    codeLens: CodeLens,
    token: CancellationToken
  ): Promise<any> {
    if (!(codeLens instanceof MethodReferenceLens))
      return;
    const locations = await commands.executeCommand<Location[]>(
      'vscode.executeReferenceProvider',
      codeLens.uri,
      codeLens.range.start
    );

    const { settings } = this.config;
    const filteredLocations = settings.excludeself
      ? locations.filter(
        location => !location.range.isEqual(codeLens.range)
      )
      : locations;

    const blackboxList = settings.blackbox || [];
    const nonBlackBoxedLocations = filteredLocations.filter(location =>
      !blackboxList.some(pattern =>
        new minimatch.Minimatch(pattern).match(location.uri.path)
      )
    );

    const isSameDocument = codeLens.uri == window.activeTextEditor.document.uri;
    const amount = nonBlackBoxedLocations.length;
    const message = ((amount: number) => {
      switch (amount) {
        case 0:
          return settings.noreferences
            .replace('{0}',
              isSameDocument
                ? window.activeTextEditor.document.getText(codeLens.range)
                : '');
        case 1:
          return settings.singular.replace('{0}', `${amount}`);
        default:
          return settings.plural.replace('{0}', `${amount}`);
      }
    })(amount);

    if (
      amount === 0 &&
      filteredLocations.length === 0 &&
      isSameDocument &&
      settings.decorateunused &&
      this.unusedDecorations.has(codeLens.uri.fsPath)
    ) {
      this.unusedDecorations
        .get(codeLens.uri.fsPath)
        .ranges
        .push(codeLens.range);
    }

    this.updateDecorations(codeLens.uri);
    const lensFrom = (command: Command) =>
      new CodeLens(new Range(
        codeLens.range.start.line,
        codeLens.range.start.character,
        codeLens.range.end.line,
        codeLens.range.end.character,
      ), command);

    if (amount === 0 && filteredLocations.length !== 0) {
      return lensFrom({
        command: '',
        title: settings.blackboxTitle,
      });
    }
    if (amount > 0) {
      return lensFrom({
        command: 'editor.action.showReferences',
        title: message,
        arguments: [
          codeLens.uri,
          codeLens.range.start,
          nonBlackBoxedLocations,
        ],
      });
    }
    return lensFrom({
      command: 'editor.action.findReferences',
      title: message,
      arguments: [codeLens.uri, codeLens.range.start],
    });
  }
  updateDecorations(uri: Uri) {
    if (uri !== window.activeTextEditor.document.uri)
      return;
    if (!this.unusedDecorations.has(uri.fsPath))
      return;
    const { decoration, ranges } = this.unusedDecorations.get(uri.fsPath);

    window.activeTextEditor.setDecorations(decoration, ranges);
  }
}
