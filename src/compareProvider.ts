import * as vscode from 'vscode';
import { getWebResourceContent } from './dataverseClient';
import { nameWithTypeExtension } from './webResourceTypes';

const SCHEME = 'wrsync-remote';
const contentStore = new Map<string, string>();
const onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

class RemoteContentProvider implements vscode.TextDocumentContentProvider {
	onDidChange = onDidChangeEmitter.event;

	provideTextDocumentContent(uri: vscode.Uri): string {
		return contentStore.get(uri.toString()) ?? '';
	}
}

/** Registers the read-only virtual document scheme that shows a Dataverse web resource's
 * published content - on its own (View Content) or diffed against its linked local file
 * (Compare) - without writing it to disk. */
export function initCompareProvider(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(SCHEME, new RemoteContentProvider())
	);
}

interface RemoteResource {
	orgApiUrl: string;
	webresourceId: string;
	webresourceName: string;
	webresourcetype: number;
}

/** Fetches the resource's current Dataverse content into the read-only document for it and
 * returns that document's URI. The URI ends in the type's extension (e.g. "sync_Lookup.js") so
 * the editor picks the right language for highlighting; reopening refreshes an open copy. */
async function loadRemoteDocument(params: RemoteResource): Promise<vscode.Uri> {
	const base64Content = await getWebResourceContent(params.orgApiUrl, params.webresourceId);
	const remoteText = Buffer.from(base64Content, 'base64').toString('utf-8');

	const fileName = nameWithTypeExtension(params.webresourceName, params.webresourcetype);
	const remoteUri = vscode.Uri.parse(`${SCHEME}:/${encodeURIComponent(fileName)}?${params.webresourceId}`);
	const changed = contentStore.has(remoteUri.toString());
	contentStore.set(remoteUri.toString(), remoteText);
	if (changed) {
		onDidChangeEmitter.fire(remoteUri);
	}
	return remoteUri;
}

function showOptions(preserveFocus: boolean | undefined): vscode.TextDocumentShowOptions | undefined {
	return preserveFocus ? { preview: true, preserveFocus: true } : undefined;
}

/** Opens a VS Code diff editor tab comparing the currently published content of a web
 * resource against its linked local file, the same way `git diff` compares two revisions. */
export async function openCompareDiff(
	params: RemoteResource & {
		localPath: string;
		/** Open as a preview tab and leave focus where it is (e.g. on the clicked tree item). */
		preserveFocus?: boolean;
	}
): Promise<void> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		throw new Error('No workspace folder is open');
	}
	const remoteUri = await loadRemoteDocument(params);
	const localUri = vscode.Uri.joinPath(folder.uri, params.localPath);
	await vscode.commands.executeCommand(
		'vscode.diff',
		remoteUri,
		localUri,
		`${params.webresourceName} (Dataverse ↔ Local)`,
		showOptions(params.preserveFocus)
	);
}

/** Opens the web resource's current Dataverse content in a read-only editor tab - for managed
 * resources (which can't be edited here) and anything not linked to a local file. */
export async function openRemoteContent(params: RemoteResource & { preserveFocus?: boolean }): Promise<void> {
	const remoteUri = await loadRemoteDocument(params);
	const document = await vscode.workspace.openTextDocument(remoteUri);
	await vscode.window.showTextDocument(document, showOptions(params.preserveFocus) ?? { preview: true });
}
