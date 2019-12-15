import { commands, workspace, window, TextEditorRevealType, Range } from "vscode";

export const commandName = 'tslens.gotoFile';

export const gotoFile = () => commands.registerCommand(
  commandName,
  (filePath: string, line: number) => workspace.openTextDocument(filePath)
    .then(doc => window.showTextDocument(doc)
      .then(editor =>
        editor.revealRange(
          new Range(line, 0, line + 1, 0),
          TextEditorRevealType.InCenter
        )))
);
