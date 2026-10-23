import * as vscode from 'vscode';
import { getWebResourceContent } from './dataverseClient';
import { nameWithTypeExtension } from './webResourceTypes';

/** Where image web resources are written for previewing: VS Code's image preview runs in a
 * webview that can't load from an extension's virtual file system ("An error occurred while
 * loading the image"), but always works with real files. Lives in the extension's own storage,
 * never the workspace, and is emptied on every activation so old copies don't pile up. */
let previewsDir: vscode.Uri;
/** The activation-time cleanup; previews wait for it, so it can't delete a fresh preview. */
let cleanedUp: Promise<void> = Promise.resolve();

export function initMediaProvider(context: vscode.ExtensionContext): void {
	previewsDir = vscode.Uri.joinPath(context.globalStorageUri, 'previews');
	cleanedUp = Promise.resolve(vscode.workspace.fs.delete(previewsDir, { recursive: true, useTrash: false })).catch(() => {
		// Nothing to clean up yet.
	});
}

/** Fetches an image web resource's current content and opens it in VS Code's image preview.
 * The file is "<id>/<name.ext>": the id keeps resources with the same name apart, the
 * extension picks the viewer, and the tab shows the name. Reopening overwrites the file, which
 * the open preview picks up. */
export async function openRemoteMedia(params: {
	orgApiUrl: string;
	webresourceId: string;
	webresourceName: string;
	webresourcetype: number;
	preserveFocus?: boolean;
}): Promise<void> {
	const [base64] = await Promise.all([getWebResourceContent(params.orgApiUrl, params.webresourceId), cleanedUp]);
	const fileName = nameWithTypeExtension(params.webresourceName, params.webresourcetype).split('/').pop()!;
	const uri = vscode.Uri.joinPath(previewsDir, params.webresourceId, fileName);
	await vscode.workspace.fs.writeFile(uri, Buffer.from(base64, 'base64'));
	await vscode.commands.executeCommand('vscode.open', uri, {
		preview: true,
		preserveFocus: params.preserveFocus ?? false,
	} satisfies vscode.TextDocumentShowOptions);
}
