import * as vscode from 'vscode';
import { getWebResourceContent } from './dataverseClient';
import { createLinks, type ResourceLink } from './linksStore';
import { getWorkspaceFileContent } from './workspaceFiles';

interface RpcRequest {
	type: 'rpc';
	id: string;
	method: string;
	params?: unknown;
}

type Handler = (params: any) => Promise<unknown>;

/** What the webview (now only the "Suggested links" tab) can call in the extension. */
const handlers: Record<string, Handler> = {
	'dataverse.getWebResourceContent': (params: { orgApiUrl: string; webresourceId: string }) =>
		getWebResourceContent(params.orgApiUrl, params.webresourceId),
	'workspace.getFileContent': (params: { path: string }) => getWorkspaceFileContent(params.path),
	// The modified tracker checks the new links itself (it listens for link changes).
	'links.createMany': (params: { links: Omit<ResourceLink, 'id'>[] }) => createLinks(params.links),
};

/** Dispatches an { type: 'rpc' } message from the webview to the matching function in this
 * extension (auth.ts, dataverseClient.ts, ...) and posts the result back tagged with the
 * request id, so the webview's callRpc() promise can resolve/reject. Stands in for the old
 * server's HTTP routes now that the webview talks to the extension host directly. */
export async function dispatchRpc(webview: vscode.Webview, message: RpcRequest): Promise<void> {
	const handler = handlers[message.method];
	if (!handler) {
		webview.postMessage({ type: 'rpcResponse', id: message.id, ok: false, error: `Unknown RPC method: ${message.method}` });
		return;
	}
	try {
		const data = await handler(message.params);
		webview.postMessage({ type: 'rpcResponse', id: message.id, ok: true, data });
	} catch (err) {
		webview.postMessage({ type: 'rpcResponse', id: message.id, ok: false, error: (err as Error).message });
	}
}
