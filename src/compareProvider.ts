import * as vscode from 'vscode';
import { getWebResourceContent } from './dataverseClient';

const SCHEME = 'wrsync-remote';
const contentStore = new Map<string, string>();
const onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

class RemoteContentProvider implements vscode.TextDocumentContentProvider {
	onDidChange = onDidChangeEmitter.event;

	provideTextDocumentContent(uri: vscode.Uri): string {
		return contentStore.get(uri.toString()) ?? '';
	}
}

/** Registers the read-only virtual document scheme that lets a Dataverse web resource's
 * published content be diffed against its linked local file without writing it to disk. */
export function initCompareProvider(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(SCHEME, new RemoteContentProvider())
	);
}

/** Opens a VS Code diff editor tab comparing the currently published content of a web
 * resource against its linked local file, the same way `git diff` compares two revisions. */
export async function openCompareDiff(params: {
	orgApiUrl: string;
	webresourceId: string;
	webresourceName: string;
	localPath: string;
}): Promise<void> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		throw new Error('No workspace folder is open');
	}

	const base64Content = await getWebResourceContent(params.orgApiUrl, params.webresourceId);
	const remoteText = Buffer.from(base64Content, 'base64').toString('utf-8');

	const remoteUri = vscode.Uri.parse(`${SCHEME}:/${encodeURIComponent(params.webresourceName)}?${params.webresourceId}`);
	const changed = contentStore.has(remoteUri.toString());
	contentStore.set(remoteUri.toString(), remoteText);
	if (changed) {
		onDidChangeEmitter.fire(remoteUri);
	}

	const localUri = vscode.Uri.joinPath(folder.uri, params.localPath);
	await vscode.commands.executeCommand(
		'vscode.diff',
		remoteUri,
		localUri,
		`${params.webresourceName} (Dataverse ↔ Local)`
	);
}
