import * as vscode from 'vscode';
import { openCompareDiff } from './compareProvider';
import { findIdenticalContent } from './linkSuggestionContent';
import { createLinks, type ResourceLink } from './linksStore';

interface RpcRequest {
	type: 'rpc';
	id: string;
	method: string;
	params?: unknown;
}

type Handler = (params: any) => Promise<unknown>;

/** What the webview (now only the "Suggested Links" tab) can call in the extension. */
const handlers: Record<string, Handler> = {
	// One call for the whole content comparison - batched downloads and local reads happen here,
	// not as a request per candidate from the page.
	'suggestions.findIdenticalContent': (params: Parameters<typeof findIdenticalContent>[0]) => findIdenticalContent(params),
	// A candidate's Compare button: opens as a tab in the Suggested Links tab's group and takes
	// focus (the list is behind it; its tab is one click away). A preview tab, so comparing the
	// next candidate reuses it instead of piling up tabs. Both sides are read-only - the
	// candidate isn't linked; this is only for judging the match.
	'compare.openDiff': (params: {
		orgApiUrl: string;
		webresourceId: string;
		webresourceName: string;
		webresourcetype: number;
		localPath: string;
	}) => openCompareDiff({ ...params, preview: true, viewColumn: vscode.ViewColumn.Active, localReadOnly: true }),
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
