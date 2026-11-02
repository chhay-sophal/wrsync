import * as vscode from 'vscode';
import { watchWorkspaceFiles } from './fileWatcher';
import { listLinks, onDidChangeLinks } from './linksStore';

/** Linked paths (relative to the workspace folder) whose file doesn't exist. */
let missing = new Set<string>();

const missingChanged = new vscode.EventEmitter<void>();
/** Fires when a linked file goes missing or comes back. */
export const onDidChangeMissingFiles = missingChanged.event;

export function isLinkedFileMissing(localPath: string): boolean {
	return missing.has(localPath);
}

/** Must be called once from activate(). Keeps track of linked files that were renamed, moved
 * or deleted outside VS Code (or by a git pull), so the tree can flag them for relinking. */
export function initMissingFiles(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		missingChanged,
		onDidChangeLinks(() => void check()),
		watchWorkspaceFiles((event) => {
			if (event.type !== 'changed') {void check();}
		}),
		// A deleted or renamed folder may only report the folder itself to the file watcher.
		vscode.workspace.onDidDeleteFiles(() => void check()),
		vscode.workspace.onDidRenameFiles(() => void check())
	);
	void check();
}

let checking: Promise<void> = Promise.resolve();

/** Checks every linked path; runs one at a time so a slow check can't overwrite a newer one. */
function check(): Promise<void> {
	checking = checking.then(async () => {
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {return;}
		const paths = [...new Set(listLinks().map((l) => l.localPath))];
		const exists = await Promise.all(
			paths.map((path) =>
				vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, path)).then(
					() => true,
					() => false
				)
			)
		);
		const next = new Set(paths.filter((_, i) => !exists[i]));
		if (next.size !== missing.size || [...next].some((p) => !missing.has(p))) {
			missing = next;
			missingChanged.fire();
		}
	});
	return checking;
}
