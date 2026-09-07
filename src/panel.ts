import * as vscode from 'vscode';
import type { WebResource } from './dataverseClient';

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

	const panel = vscode.window.createWebviewPanel(
		'wrsyncMain',
		'Web Resource Sync',
		vscode.ViewColumn.One,
		{ enableScripts: true }
	);
	currentPanel = panel;

	readyPromise = new Promise((resolve) => {
		panel.webview.onDidReceiveMessage((message: { type: string; id?: string; name?: string }) => {
			if (message.type === 'ready') {
				resolve();
				return;
			}
			if (message.type === 'resourcePicked') {
				vscode.window.showInformationMessage(`You clicked: ${message.name} (${message.id})`);
			}
		});
	});

	panel.webview.html = getHtml();

	panel.onDidDispose(() => {
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

function getHtml(): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<title>Web Resource Sync</title>
	<style>
		body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
		li { cursor: pointer; padding: 2px 0; }
		li:hover { text-decoration: underline; }
	</style>
</head>
<body>
	<h1>Web Resource Sync</h1>
	<p id="status">Waiting for a web resource list…</p>
	<ul id="list"></ul>

	<script>
		const vscodeApi = acquireVsCodeApi();
		const statusEl = document.getElementById('status');
		const listEl = document.getElementById('list');

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (message.type === 'webResources') {
				renderList(message.resources);
			}
		});

		function renderList(resources) {
			statusEl.textContent = resources.length + ' web resource(s):';
			listEl.innerHTML = '';
			for (const r of resources) {
				const li = document.createElement('li');
				li.textContent = r.name + ' — ' + r.displayname;
				li.addEventListener('click', () => {
					vscodeApi.postMessage({ type: 'resourcePicked', id: r.webresourceid, name: r.name });
				});
				listEl.appendChild(li);
			}
		}

		// Tell the extension we've loaded and are ready to receive messages - sent last,
		// after the listener above is already registered.
		vscodeApi.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
}
