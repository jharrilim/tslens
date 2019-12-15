'use strict';
import { AppConfiguration } from './classes/app-configuration';
import {
  window,
  ExtensionContext,
  languages,
  Disposable,
  workspace,
} from 'vscode';
import { 
  TSCodeRefProvider, 
  TSCodeLensProvider, 
  TSCodeHoverProvider
} from './providers';
import { provider } from './provider';
import { gotoFile } from './commands/goto-file';
import { showOverrides } from './commands/show-overrides';
import { updateTextEditor } from './commands';
import { update } from './commands/update';

export function activate(context: ExtensionContext) {
  const config = new AppConfiguration();
  const tsProvider = new TSCodeLensProvider(config, provider, context);
  const refProvider = new TSCodeRefProvider(provider, context);
  const hoverProvider = new TSCodeHoverProvider(config);
  const updateEditor = updateTextEditor(config, tsProvider);

  // Language Providers
  context.subscriptions.push(
    languages.registerCodeLensProvider(
      { pattern: '**/*.ts' },
      tsProvider
    ),
    languages.registerCodeLensProvider(
      { pattern: '**/*.ts' },
      refProvider
    ),
    languages.registerHoverProvider(
      { pattern: '**/*.ts' },
      hoverProvider
    ),
  );

  // Workspace Events
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        updateEditor();
        tsProvider.updateDecorations(editor.document.uri);
      }
    }),
    workspace.onDidSaveTextDocument(updateEditor),
  );

  // Commands
  context.subscriptions.push(
    update(updateEditor),
    gotoFile(),
    showOverrides(config),
  );
}

