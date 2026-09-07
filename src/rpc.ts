import * as vscode from 'vscode';
import { getAuthStatus, login, logout } from './auth';
import { listEnvironments, listSolutions } from './dataverseClient';

interface RpcRequest {
	type: 'rpc';
	id: string;
	method: string;
	params?: unknown;
}

type Handler = (params: any) => Promise<unknown>;

const handlers: Record<string, Handler> = {
	'auth.status': () => getAuthStatus(),
	'auth.login': (params: { tenant?: string } = {}) => login(params.tenant),
	'auth.logout': () => logout(),
	'dataverse.listEnvironments': () => listEnvironments(),
	'dataverse.listSolutions': (params: { orgApiUrl: string }) => listSolutions(params.orgApiUrl),
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
