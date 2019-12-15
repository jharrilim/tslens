import { TextDocument, CancellationToken, commands, SymbolInformation, Range } from 'vscode';
import { MethodReferenceLens } from './classes/method-reference-lens';
import { symbolsAggregator } from './classes/introspection';


const findSymbolRange = (document: TextDocument, symbolInformation: SymbolInformation) => {
  let index = -1;
  let lineIndex = symbolInformation.location.range.start.line;
  let symbolRange: Range = null;
  do {
    symbolRange = symbolInformation.location.range;
    index = document.lineAt(lineIndex).text.lastIndexOf(symbolInformation.name);
    if (index > -1) {
      break;
    }
    lineIndex++;
  } while (lineIndex <= symbolInformation.location.range.end.line);

  return { symbolRange, lineIndex, index };
};

function traceSymbolInfo(document: TextDocument, usedPositions: number[], symbolInformation: SymbolInformation): MethodReferenceLens {
  if (symbolInformation.name === '<function>')
    return null;

  const { symbolRange, index, lineIndex } = findSymbolRange(document, symbolInformation);

  const range = index === -1
    ? new Range(
      symbolRange.start.line,
      document.lineAt(symbolInformation.location.range.start.line)
        .firstNonWhitespaceCharacterIndex,
      lineIndex,
      90000
    )
    : new Range(lineIndex, index, lineIndex, index + symbolInformation.name.length);

  const position = document.offsetAt(range.start);

  if (!usedPositions[position])
    usedPositions[position] = 1;

  return new MethodReferenceLens(
    new Range(range.start, range.end),
    document.uri,
    null,
    null,
    symbolInformation
  );
}

export async function provider(document: TextDocument, token: CancellationToken): Promise<MethodReferenceLens[]> {
  try {
    const symbolInformations = await commands.executeCommand<SymbolInformation[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );

    const usedPositions = [];
    return symbolsAggregator(document, usedPositions, symbolInformations)
      .reduce((lenses, symbolInformation) => {
        const lens = traceSymbolInfo(document, usedPositions, symbolInformation);
        return lens
          ? lenses.concat(lens)
          : lenses
      }, []);
  } catch (error) {
    console.log(error);
    return [];
  }
}

export type MethodReferenceLensProvider = typeof provider;
