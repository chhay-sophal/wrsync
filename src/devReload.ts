import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** How long webview-ui/dist must stay quiet before it counts as rebuilt: `vite build --watch`
 * empties the folder and then writes it, in several bursts. */
const SETTLE_MS = 400;

const webviewRebuilt = new vscode.EventEmitter<void>();
/** Fires after `vite build --watch` finishes writing a new webview build - development mode
 * only (F5), so webviews can reload themselves instead of needing "Developer: Reload
 * Webviews" after every UI change. Never fires in an installed extension. */
export const onDidRebuildWebview = webviewRebuilt.event;

/** Whether dist holds a complete build: index.html plus every asset it references. Reloading
 * against a half-written build is what produces a blank webview. */
function isCompleteBuild(distDir: string): boolean {
	try {
		const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
		const assets = [...html.matchAll(/(?:src|href)="\.\/(.*?)"/g)].map((m) => m[1]);
		return assets.length > 0 && assets.every((asset) => fs.existsSync(path.join(distDir, asset)));
	} catch {
		return false;
	}
}

export function initDevReload(context: vscode.ExtensionContext): void {
	if (context.extensionMode !== vscode.ExtensionMode.Development) {return;}

	const distDir = vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist').fsPath;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const scheduleCheck = () => {
		if (timer) {clearTimeout(timer);}
		timer = setTimeout(() => {
			timer = undefined;
			if (isCompleteBuild(distDir)) {
				webviewRebuilt.fire();
			} else {
				scheduleCheck(); // Still being written - look again once it settles.
			}
		}, SETTLE_MS);
	};

	let watcher: fs.FSWatcher | undefined;
	try {
		// Recursive so writes into dist/assets count too; the folder itself survives Vite's
		// emptyOutDir (only its contents are removed).
		watcher = fs.watch(distDir, { recursive: true }, scheduleCheck);
	} catch {
		// dist doesn't exist yet (no build so far) - nothing to watch; F5's build task creates it.
		return;
	}
	context.subscriptions.push({
		dispose: () => {
			watcher?.close();
			if (timer) {clearTimeout(timer);}
		},
	});
}
