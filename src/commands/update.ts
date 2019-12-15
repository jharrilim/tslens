import { commands } from 'vscode';

export const commandName = 'tslens.update';
export const update = (updater: (...args: any[]) => any) => commands.registerCommand(commandName, updater);
