import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { watchWorkspaceFiles } from './fileWatcher';
import { dispatchRpc } from './rpc';

/**
 * Hosts the Web Resource Sync UI as a persistent view in the Activity Bar sidebar (replacing
 * an earlier editor-tab-panel version) so it stays visible alongside the code you're editing.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
	constructor(private readonly extensionUri: vscode.Uri) {}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		const webviewUiDist = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist');

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [webviewUiDist],
		};
		webviewView.webview.html = getHtml(webviewView.webview, webviewUiDist);

		const watcher = watchWorkspaceFiles((event) => {
			webviewView.webview.postMessage({ type: 'fileEvent', event });
		});

		webviewView.webview.onDidReceiveMessage((message: { type: string; id?: string; method?: string; params?: unknown }) => {
			if (message.type === 'rpc') {
				dispatchRpc(webviewView.webview, message as { type: 'rpc'; id: string; method: string; params?: unknown });
			}
		});

		webviewView.onDidDispose(() => {
			watcher.dispose();
		});
	}
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
