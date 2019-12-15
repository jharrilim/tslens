import {
  Project,
  ClassDeclaration,
  ClassMemberTypes,
  ExpressionWithTypeArguments,
  InterfaceDeclaration,
  NamespaceDeclaration,
  TypeElementTypes
} from 'ts-morph';
import { TextDocument, SymbolInformation } from 'vscode';

/**
 * Agreegates symbol information including children
 * @param document
 * @param usedPositions
 * @param symbolInformations
 * @param symbols
 */
export function symbolsAggregator(
  document: TextDocument,
  usedPositions: {},
  symbolInformations: SymbolInformation[],
  symbols: SymbolInformation[] = [],
  parent: string = null
): SymbolInformation[] {
  symbolInformations.forEach(x => {
    if (parent) {
      x.containerName = parent;
    }

    symbols.push(x);
    symbolsAggregator(
      document,
      usedPositions,
      x['children'] || [],
      symbols,
      x.name
    );
  });

  return symbols;
}

/**
 * Gets all interfaces inside a project
 * @param project The source project
 */
export const getInterfaces = (project: Project): InterfaceDeclaration[] => project.getSourceFiles()
  .reduce<InterfaceDeclaration[]>((interfaceDeclarations, sources) => {
    try {
      const namespaces: NamespaceDeclaration[] = sources.getNamespaces();
      return interfaceDeclarations.concat(
        namespaces.length > 0
          ? namespaces.reduce<InterfaceDeclaration[]>(
            (prev, m) => prev.concat(m.getInterfaces()),
            [])
          : sources.getInterfaces()
      );
    } catch (error) {
      console.warn(
        `Error occured while trying to get interfaces from ${sources.getFilePath()}. ${error}`
      );
      return interfaceDeclarations;
    }
  }, []);

/**
 * Finds an interface by expression declaration of a interface
 * @param interfaces Interfaces list
 * @param x Expression
 */
export function findInterfaceByName(
  interfaces: InterfaceDeclaration[],
  x: ExpressionWithTypeArguments
): InterfaceDeclaration {
  const iname: string = getInterfaceName(x);
  return interfaces.find(interfaze => {
    try {
      return interfaze.getName() === iname;
    } catch (error) {
      return false;
    }
  });
}
/**
 * Checks the project for interfaces changes
 * @param project Source project
 * @param locations File path's to search in
 */
export function checkInterfaces(project: Project, locations: string[]): boolean {
  let isChanged = false;
  [... new Set(locations)].forEach(location => {
    const interfaces: InterfaceDeclaration[] = getInterfacesAtPath(
      project,
      location
    );
    const path = location.replace(/\\/g, '/');
    if (
      interfaces.length > 0 &&
      !interfaces.some(x => x.getSourceFile().getFilePath() === path)
    ) {
      interfaces.push(...interfaces);
      isChanged = true;
    }
  });
  return isChanged;
}

/**
 * Gets implementations for class
 * @param interfaces Interfaces list
 * @param clazz Class
 */
export const getClassImplements = (interfaces: InterfaceDeclaration[], clazz: ClassDeclaration): TypeElementTypes[] =>
  clazz.getImplements().reduce<TypeElementTypes[]>((typeElementTypes, implemented) => {
    const interfaze = findInterfaceByName(interfaces, implemented);
    if (!interfaze)
      return typeElementTypes;

    const interfaceDeclarations: InterfaceDeclaration[] = [interfaze].concat(
      interfaze.getExtends().reduce<InterfaceDeclaration[]>(
        (_interfaceDeclarations, expressionWithTypeArgs) => {
          const interf = findInterfaceByName(interfaces, expressionWithTypeArgs);
          return interf ? _interfaceDeclarations.concat(interf) : _interfaceDeclarations;
        }, []));

    return typeElementTypes.concat(interfaceDeclarations
      .reduce((_interfaceDeclarations, interfaceDeclaration) =>
        _interfaceDeclarations.concat(interfaceDeclaration.getMembers()
          .map(typeEl => {
            typeEl['interface'] = implemented;
            return typeEl;
          })), []));
  }, []);

/**
 *
 * @param interfaces Gets class members (methods, fields, props) including base class members
 * @param startClass Initial class to start search for
 * @param cl For internal use!
 * @param arr For internal use!
 */
export function getClassMembers(
  interfaces: InterfaceDeclaration[],
  startClass: ClassDeclaration,
  cl?: ClassDeclaration,
  arr?: Array<ClassMemberTypes | TypeElementTypes>
): Array<ClassMemberTypes | TypeElementTypes> {
  arr = arr || getClassImplements(interfaces, cl || startClass);
  const bc: ClassDeclaration = (cl || startClass).getBaseClass();
  if (bc) {
    const methods: ClassMemberTypes[] = bc.getMembers();

    // tslint:disable-next-line:no-string-literal
    methods.forEach(x => (x['baseClass'] = bc));
    return arr.concat(
      getClassImplements(interfaces, bc),
      methods,
      getClassMembers(interfaces, startClass, bc, methods)
    );

  } else {
    return getClassImplements(interfaces, cl || startClass);
  }
}

/**
 * Gets the interface declarations for a file
 * @param project Source project
 * @param path Path to search in
 */
export function getInterfacesAtPath(
  project: Project,
  path: string
): InterfaceDeclaration[] {
  const file = project.getSourceFile(path);

  return file
    ? file.getNamespaces()
      .reduce((interfaces, interfaze) => interfaces.concat(interfaze.getInterfaces()), [])
      .concat(file.getInterfaces())
    : [];
}

/**
 * Gets the interface name from an expression
 * @param f Expression
 */
export function getInterfaceName(f: ExpressionWithTypeArguments): string {
  // tslint:disable-next-line:no-string-literal
  if (f.compilerNode.expression['name']) {
    // tslint:disable-next-line:no-string-literal
    return f.compilerNode.expression['name'].escapedText.trim();
    // tslint:disable-next-line:no-string-literal
  } else if (f.compilerNode.expression['escapedText']) {
    // tslint:disable-next-line:no-string-literal
    return f.compilerNode.expression['escapedText'].trim();
  } else {
    return f.compilerNode.expression.getText().trim();
  }
}
