import * as vscode from 'vscode';

let currentPanel: vscode.WebviewPanel | undefined;

/** Opens the main Web Resource Sync panel, or reveals it if it's already open. */
export function openPanel(): void {
	if (currentPanel) {
		currentPanel.reveal();
		return;
	}

	currentPanel = vscode.window.createWebviewPanel(
		'wrsyncMain',
		'Web Resource Sync',
		vscode.ViewColumn.One,
		{ enableScripts: true }
	);

	currentPanel.webview.html = getHtml();

	currentPanel.onDidDispose(() => {
		currentPanel = undefined;
	});
}

function getHtml(): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<title>Web Resource Sync</title>
</head>
<body>
	<h1>Web Resource Sync</h1>
	<p>Webview is alive.</p>
</body>
</html>`;
}
