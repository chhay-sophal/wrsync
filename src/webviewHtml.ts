import * as fs from 'node:fs';
import * as vscode from 'vscode';

/** Loads the built webview-ui/dist/index.html, rewrites its relative asset references
 * into webview.asWebviewUri() URIs, and injects a CSP restricting content to that dist
 * folder plus inline styles (Vite's built CSS is linked, not inlined, but React itself
 * sets inline style attributes at runtime). `view` picks which page the shared bundle
 * renders (see webview-ui/src/Root.tsx) - set as a data attribute, since the CSP rules out
 * an inline script. */
export function getHtml(webview: vscode.Webview, webviewUiDist: vscode.Uri, view?: string): string {
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
	if (view) {
		html = html.replace('<div id="root">', `<div id="root" data-view="${view}">`);
	}

	return html;
}
