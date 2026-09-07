import * as vscode from 'vscode';
import { INCLUDE_GLOB, isExcludedPath } from './workspaceFiles';

export interface FileEvent {
	type: 'added' | 'changed' | 'removed';
	path: string;
}

/**
 * Watches web-resource-shaped files in the first open workspace folder, calling onEvent for
 * each create/change/delete not under an excluded directory. Returns a Disposable - callers
 * own its lifecycle (tied to whichever panel wants live updates, since there's no point
 * watching while nothing is listening).
 */
export function watchWorkspaceFiles(onEvent: (event: FileEvent) => void): vscode.Disposable {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		return { dispose: () => {} };
	}

	const pattern = new vscode.RelativePattern(folder, INCLUDE_GLOB);
	const watcher = vscode.workspace.createFileSystemWatcher(pattern);

	function emit(type: FileEvent['type'], uri: vscode.Uri) {
		const path = vscode.workspace.asRelativePath(uri, false);
		if (isExcludedPath(path)) {return;}
		onEvent({ type, path });
	}

	const subscriptions = [
		watcher.onDidCreate((uri) => emit('added', uri)),
		watcher.onDidChange((uri) => emit('changed', uri)),
		watcher.onDidDelete((uri) => emit('removed', uri)),
	];

	return vscode.Disposable.from(watcher, ...subscriptions);
}
