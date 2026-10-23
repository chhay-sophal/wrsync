import * as vscode from 'vscode';
import { dispatchRpc } from './rpc';
import { getHtml } from './sidebarView';

/** Everything the "Suggested links" page needs, gathered by the sidebar (which already has
 * the solution's resources, links and workspace files loaded). */
export interface LinkSuggestionsData {
	orgApiUrl: string;
	environmentId: string;
	solutionUniqueName: string;
	solutionName: string;
	resources: { webresourceid: string; name: string; webresourcetype: number }[];
	filePaths: string[];
}

let extensionUri: vscode.Uri;
let panel: vscode.WebviewPanel | undefined;
let currentData: LinkSuggestionsData | undefined;

export function initLinkSuggestionsPanel(context: vscode.ExtensionContext): void {
	extensionUri = context.extensionUri;
}

function postInit(): void {
	// A fresh nonce each time makes the page restart its review even if it's already open.
	panel?.webview.postMessage({ type: 'init', nonce: Date.now(), data: currentData });
}

/** Opens "Suggested links" in an editor tab - the sidebar is too narrow to review a list of
 * resource/file pairs comfortably. There's one tab at a time: opening again (e.g. for another
 * solution) reuses it with the new data. */
export function openLinkSuggestionsPanel(data: LinkSuggestionsData): void {
	currentData = data;
	const title = `Suggested links - ${data.solutionName}`;
	if (panel) {
		panel.title = title;
		panel.reveal();
		postInit();
		return;
	}

	const webviewUiDist = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist');
	panel = vscode.window.createWebviewPanel('wrsync.linkSuggestions', title, vscode.ViewColumn.Active, {
		enableScripts: true,
		localResourceRoots: [webviewUiDist],
		// Keeps the review (ticks, picked files, finished content checks) while the user looks
		// at another tab, e.g. to inspect a candidate file.
		retainContextWhenHidden: true,
	});
	panel.webview.html = getHtml(panel.webview, webviewUiDist, 'linkSuggestions');

	panel.webview.onDidReceiveMessage((message: { type: string; id?: string; method?: string; params?: unknown }) => {
		if (message.type === 'ready') {
			postInit();
		} else if (message.type === 'close') {
			panel?.dispose();
		} else if (message.type === 'reload' && panel) {
			// From the page's error screen; the reloaded page reports ready and gets the data again.
			panel.webview.html = getHtml(panel.webview, webviewUiDist, 'linkSuggestions');
		} else if (message.type === 'rpc') {
			dispatchRpc(panel!.webview, message as { type: 'rpc'; id: string; method: string; params?: unknown });
		}
	});
	panel.onDidDispose(() => {
		panel = undefined;
		currentData = undefined;
	});
}
