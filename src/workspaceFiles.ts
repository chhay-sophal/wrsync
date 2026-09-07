import * as vscode from 'vscode';

const textDecoder = new TextDecoder();

export interface LocalFile {
	path: string;
	mtimeMs: number;
}

export const INCLUDE_GLOB = '**/*.{html,htm,js,css,xml,svg,resx}';
const EXCLUDE_GLOB = '**/{node_modules,.git,dist,out}/**';
const EXCLUDE_SEGMENTS = new Set(['node_modules', '.git', 'dist', 'out']);

/** createFileSystemWatcher() has no separate exclude-glob parameter (unlike findFiles()), so
 * the watcher filters matches against this instead, keeping the same exclusions as
 * EXCLUDE_GLOB above. */
export function isExcludedPath(relativePath: string): boolean {
	return relativePath.split(/[\\/]/).some((segment) => EXCLUDE_SEGMENTS.has(segment));
}

/**
 * Lists web-resource-shaped files in the first open workspace folder. Unlike the original
 * desktop app (which needed its own folder-picker + "watched root" setting because Tauri has
 * no notion of a project), a VS Code extension already runs against whichever folder the user
 * has open - vscode.workspace.workspaceFolders stands in for that entirely.
 */
export async function listWorkspaceFiles(): Promise<{ root: string | null; files: LocalFile[] }> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		return { root: null, files: [] };
	}

	const uris = await vscode.workspace.findFiles(INCLUDE_GLOB, EXCLUDE_GLOB);
	const files = await Promise.all(
		uris.map(async (uri): Promise<LocalFile> => {
			const stat = await vscode.workspace.fs.stat(uri);
			return { path: vscode.workspace.asRelativePath(uri, false), mtimeMs: stat.mtime };
		})
	);
	files.sort((a, b) => a.path.localeCompare(b.path));

	return { root: folder.uri.fsPath, files };
}

/** Reads a file's content as UTF-8 text, resolved relative to the first open workspace
 * folder (the same root listWorkspaceFiles() reports paths against). */
export async function getWorkspaceFileContent(relativePath: string): Promise<string> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		throw new Error('No workspace folder is open');
	}
	const uri = vscode.Uri.joinPath(folder.uri, relativePath);
	const bytes = await vscode.workspace.fs.readFile(uri);
	return textDecoder.decode(bytes);
}
