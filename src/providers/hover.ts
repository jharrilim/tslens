import { HoverProvider, TextDocument, Position, CancellationToken, Hover } from 'vscode';
import { TSCodeLensProvider } from './lens';
import { AppConfiguration } from '../classes/app-configuration';

export class TSCodeHoverProvider implements HoverProvider {
  constructor(private readonly config: AppConfiguration) { }

  provideHover(document: TextDocument, position: Position, _token: CancellationToken) {

    if (!this.config.settings.basePreviewOnHover) {
      return null;
    }
    const key = `${document.uri.fsPath}_${position.line}`;

    return TSCodeLensProvider.methods.has(key)
      ? new Hover({
        language: 'typescript',
        value: TSCodeLensProvider.methods.get(key)
      })
      : null;
  }
}
