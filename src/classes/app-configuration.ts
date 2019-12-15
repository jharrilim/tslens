import { TSLensConfiguration } from './ts-lens-configuration';
import { Project, ProjectOptions } from 'ts-morph';
import * as vscode from 'vscode';
import fs from 'fs';


export class AppConfiguration {
  private cachedSettings: TSLensConfiguration;

  public readonly project: Project;

  constructor() {
    if (vscode.workspace.rootPath) {

      const options: ProjectOptions = {
        tsConfigFilePath: this.settings.tsConfigPath || (vscode.workspace.rootPath + '/tsconfig.json'),
        addFilesFromTsConfig: true
      };

      const exists = fs.existsSync(options.tsConfigFilePath);
      if (exists) {
        this.project = new Project(options);
      } else {
        this.project = new Project();
      }
    }
    vscode.workspace.onDidChangeConfiguration(_ => {
      this.cachedSettings = null;
    });
  }

  get extensionName() {
    return 'tslens';
  }

  get settings(): TSLensConfiguration {
    if (!this.cachedSettings) {
      const settings = vscode.workspace.getConfiguration(this.extensionName);
      this.cachedSettings = new TSLensConfiguration();
      for (const propertyName in this.cachedSettings) {
        if (settings.has(propertyName)) {
          this.cachedSettings[propertyName] = settings.get(propertyName);
        }
      }
    }
    return this.cachedSettings;
  }
}
