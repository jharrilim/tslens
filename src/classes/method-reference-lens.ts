import { CodeLens, SymbolInformation } from 'vscode';
import {
  Range,
  Command,
  Uri
} from 'vscode';
import { TSDecoration } from "./ts-decoration";
import { MethodDeclaration, PropertyDeclaration, PropertySignature, MethodSignature } from 'ts-morph';

export class MethodReferenceLens extends CodeLens {
  uri: Uri;
  decoration: TSDecoration;
  isClassed: boolean;
  isInterface: boolean;
  symbol: SymbolInformation;
  testName: string;
  classInd: Array<PropertyDeclaration | MethodDeclaration>;
  interfaceInd: Array<PropertySignature | MethodSignature>;
  isChanged: boolean;

  constructor(range: Range, uri: Uri, command?: Command, decoration?: TSDecoration, symbol?: SymbolInformation) {
    super(range, command);
    this.uri = uri;
    this.decoration = decoration;
    this.symbol = symbol;
  }
}