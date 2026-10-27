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
	return setVirtualDocument(vscode.Uri.parse(`${SCHEME}:/${encodeURIComponent(fileName)}?${params.webresourceId}`), remoteText);
}

/** Stores text for a read-only virtual document and returns its URI; an open copy refreshes. */
function setVirtualDocument(uri: vscode.Uri, text: string): vscode.Uri {
	const existed = contentStore.has(uri.toString());
	contentStore.set(uri.toString(), text);
	if (existed) {
		onDidChangeEmitter.fire(uri);
	}
	return uri;
}

/** A read-only snapshot of a local file, for diffs where the file mustn't be edited (Suggested
 * links: it isn't linked yet, you're only judging whether it's the right match). The path keeps
 * the file's extension for highlighting; the "local" query keeps it apart from Dataverse
 * documents. Reflects the file when Compare was clicked - clicking again refreshes it. */
async function loadLocalSnapshot(folder: vscode.WorkspaceFolder, localPath: string): Promise<vscode.Uri> {
	const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, localPath));
	return setVirtualDocument(
		vscode.Uri.parse(`${SCHEME}:/${encodeURIComponent(localPath)}?local`),
		Buffer.from(bytes).toString('utf-8')
	);
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
		/** Open as a preview tab (replaced by the next preview) even when taking focus. */
		preview?: boolean;
		/** Where to open it. Default: the active editor group, as a tab next to the current one. */
		viewColumn?: vscode.ViewColumn;
		/** Show a read-only snapshot of the local file instead of the file itself, so neither
		 * side can be edited. Off by default: the Web Resources view's Compare keeps the local
		 * side editable, so changed blocks can be copied over from Dataverse. */
		localReadOnly?: boolean;
	}
): Promise<void> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		throw new Error('No workspace folder is open');
	}
	const [remoteUri, localUri] = await Promise.all([
		loadRemoteDocument(params),
		params.localReadOnly ? loadLocalSnapshot(folder, params.localPath) : vscode.Uri.joinPath(folder.uri, params.localPath),
	]);
	const title = params.localReadOnly
		? `${params.webresourceName} ↔ ${params.localPath} (read-only)`
		: `${params.webresourceName} (Dataverse ↔ Local)`;
	await vscode.commands.executeCommand('vscode.diff', remoteUri, localUri, title, {
		...showOptions(params.preserveFocus),
		...(params.preview ? { preview: true } : {}),
		viewColumn: params.viewColumn,
	});
}

/** Opens the web resource's current Dataverse content in a read-only editor tab - for managed
 * resources (which can't be edited here) and anything not linked to a local file. */
export async function openRemoteContent(params: RemoteResource & { preserveFocus?: boolean }): Promise<void> {
	const remoteUri = await loadRemoteDocument(params);
	const document = await vscode.workspace.openTextDocument(remoteUri);
	await vscode.window.showTextDocument(document, showOptions(params.preserveFocus) ?? { preview: true });
}
