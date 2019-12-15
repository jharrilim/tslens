import { window } from 'vscode';
import { TSCodeLensProvider } from '../providers/lens';
import { AppConfiguration } from '../classes/app-configuration';

export const updateTextEditor = (config: AppConfiguration, tsProvider: TSCodeLensProvider) => () => {
  const filePath = window.activeTextEditor.document.fileName;
  const file = config.project.getSourceFile(filePath);

  if (file) {
    return file.refreshFromFileSystem().then(_ => tsProvider.initInterfaces());
  }
};