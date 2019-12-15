import { AppConfiguration } from '../classes/app-configuration';
import { commands, window, SymbolInformation, SymbolKind } from 'vscode';
import { symbolsAggregator } from '../classes/introspection';
import { SyntaxKind } from 'ts-morph';

type Member = { label: string, description: string };

export const commandName = 'tslens.showOverrides';

export const showOverrides = (config: AppConfiguration) => commands.registerCommand(commandName, async () => {
  const sourceFile = config.project.getSourceFile(
    window.activeTextEditor.document.fileName
  );

  const symbols = symbolsAggregator(window.activeTextEditor.document, {}, await commands.executeCommand<SymbolInformation[]>(
    'vscode.executeDocumentSymbolProvider',
    window.activeTextEditor.document.uri
  ));

  const symbolFound = symbols.find(symbol => symbol.location.range.contains(window.activeTextEditor.selection.active));

  if (!(symbolFound && symbolFound.kind === SymbolKind.Class))
    return;
  const clazz = sourceFile.getClass(symbolFound.name);

  if (!clazz)
    return;

  const baseClass = clazz.getBaseClass();

  const members = baseClass ? baseClass.getProperties()
    .reduce<Member[]>((props, prop) =>
      !prop.hasModifier(SyntaxKind.PrivateKeyword)
        && clazz.getProperties().some(prop => prop.getName())
        ? props.concat({ label: prop.getName(), description: 'Property' })
        : props
      , [])
    .concat(baseClass.getMethods().reduce<Member[]>((methods, method) =>
      !method.hasModifier(SyntaxKind.PrivateKeyword)
        && clazz.getMethods().some(method => method.getName())
        ? methods.concat({ label: method.getName(), description: 'Method' })
        : methods
      , []))
    : [];

  const memberDescriptor = await window.showQuickPick<Member>(members);

  if (members.length <= 0 || memberDescriptor === undefined)
    return await window.showWarningMessage(
      'No override candidates found for ' + symbolFound.name
    );

  if (memberDescriptor.description === 'Method') {
    const method = baseClass.getMethod(memberDescriptor.label);
    if (method) {
      clazz.addMethod({
        name: method.getName(),
        parameters: method.getParameters().map(param => ({
          name: param.getName(),
          type: param.getType().getText()
        })),
        returnType: method.getReturnType().getText()
      });
      return await sourceFile.save();
    }
  }

  if (memberDescriptor.description === 'Property') {
    const prop = baseClass.getProperty(memberDescriptor.label);
    if (prop) {
      clazz.addProperty({
        name: prop.getName(),
        type: prop.getType().getText()
      });
      return await sourceFile.save();
    }
  }
});