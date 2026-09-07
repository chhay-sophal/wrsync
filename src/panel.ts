import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { WebResource } from './dataverseClient';
import { watchWorkspaceFiles } from './fileWatcher';
import { dispatchRpc } from './rpc';

let extensionUri: vscode.Uri;

/** Captures the extension's install location so getHtml() can later resolve the
 * webview-ui build output on disk. Must be called once from activate(). */
export function initPanel(context: vscode.ExtensionContext): void {
	extensionUri = context.extensionUri;
}

let currentPanel: vscode.WebviewPanel | undefined;
/** Resolves once the current panel's webview script has loaded and is listening for
 * messages - postMessage() sent before that point is silently dropped, so anything we send
 * has to wait on this first. */
let readyPromise: Promise<void> | undefined;

/** Opens the main Web Resource Sync panel, or reveals it if it's already open. Resolves
 * once the webview is actually ready to receive messages. */
export function openPanel(): Promise<vscode.WebviewPanel> {
	if (currentPanel) {
		currentPanel.reveal();
		return Promise.resolve(currentPanel);
	}

	const webviewUiDist = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist');

	const panel = vscode.window.createWebviewPanel(
		'wrsyncMain',
		'Web Resource Sync',
		vscode.ViewColumn.One,
		{ enableScripts: true, localResourceRoots: [webviewUiDist] }
	);
	currentPanel = panel;

	readyPromise = new Promise((resolve) => {
		panel.webview.onDidReceiveMessage((message: { type: string; id?: string; name?: string; method?: string; params?: unknown }) => {
			if (message.type === 'ready') {
				resolve();
				return;
			}
			if (message.type === 'resourcePicked') {
				vscode.window.showInformationMessage(`You clicked: ${message.name} (${message.id})`);
				return;
			}
			if (message.type === 'rpc') {
				dispatchRpc(panel.webview, message as { type: 'rpc'; id: string; method: string; params?: unknown });
			}
		});
	});

	panel.webview.html = getHtml(panel.webview, webviewUiDist);

	const watcher = watchWorkspaceFiles((event) => {
		panel.webview.postMessage({ type: 'fileEvent', event });
	});

	panel.onDidDispose(() => {
		watcher.dispose();
		currentPanel = undefined;
		readyPromise = undefined;
	});

	return readyPromise.then(() => panel);
}

/** Sends a web resource list to the (already-open) panel to render. Safe to call right
 * after openPanel() even on a freshly created panel - waits for its ready handshake first. */
export async function showWebResources(resources: WebResource[]): Promise<void> {
	if (!currentPanel) {return;}
	if (readyPromise) {await readyPromise;}
	currentPanel.webview.postMessage({ type: 'webResources', resources });
}

/** Loads the built webview-ui/dist/index.html, rewrites its relative asset references
 * into webview.asWebviewUri() URIs, and injects a CSP restricting content to that dist
 * folder plus inline styles (Vite's built CSS is linked, not inlined, but React itself
 * sets inline style attributes at runtime). */
function getHtml(webview: vscode.Webview, webviewUiDist: vscode.Uri): string {
	const indexPath = vscode.Uri.joinPath(webviewUiDist, 'index.html').fsPath;
	let html = fs.readFileSync(indexPath, 'utf-8');

	html = html.replace(/(src|href)="\.\/(.*?)"/g, (_match, attr: string, relativePath: string) => {
		const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUiDist, relativePath));
		return `${attr}="${assetUri.toString()}"`;
	});

	const csp = [
		`default-src 'none'`,
		`img-src ${webview.cspSource} https: data:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src ${webview.cspSource}`,
		`font-src ${webview.cspSource}`,
	].join('; ');

	html = html.replace('<head>', `<head>\n\t<meta http-equiv="Content-Security-Policy" content="${csp}" />`);

	return html;
}
