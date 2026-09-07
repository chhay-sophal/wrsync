import * as vscode from 'vscode';

export interface LocalFile {
	path: string;
	mtimeMs: number;
}

const INCLUDE_GLOB = '**/*.{html,htm,js,css,xml,svg,resx}';
const EXCLUDE_GLOB = '**/{node_modules,.git,dist,out}/**';

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
