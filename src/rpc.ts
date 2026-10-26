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

/** What the webview (now only the "Suggested links" tab) can call in the extension. */
const handlers: Record<string, Handler> = {
	// One call for the whole content comparison - batched downloads and local reads happen here,
	// not as a request per candidate from the page.
	'suggestions.findIdenticalContent': (params: Parameters<typeof findIdenticalContent>[0]) => findIdenticalContent(params),
	// A candidate's Compare button: opens beside the Suggested links tab, as a preview that
	// leaves focus on the page, so candidates can be checked one after another. Both sides are
	// read-only - the candidate isn't linked; this is only for judging the match.
	'compare.openDiff': (params: {
		orgApiUrl: string;
		webresourceId: string;
		webresourceName: string;
		webresourcetype: number;
		localPath: string;
	}) => openCompareDiff({ ...params, preserveFocus: true, viewColumn: vscode.ViewColumn.Beside, localReadOnly: true }),
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
