import * as vscode from 'vscode';
import { getAuthStatus, login, logout } from './auth';
import { openCompareDiff } from './compareProvider';
import {
	createWebResource,
	getWebResourceContent,
	getWebResourceDetails,
	listEnvironments,
	listSolutions,
	listWebResourcesForSolution,
	publishWebResources,
	updateWebResourceContent,
} from './dataverseClient';
import { createLink, deleteLink, listLinks, type ResourceLink } from './linksStore';
import { scheduleModifiedCountRefresh } from './modifiedTracker';
import { getWorkspaceFileContent, listWorkspaceFiles } from './workspaceFiles';

interface RpcRequest {
	type: 'rpc';
	id: string;
	method: string;
	params?: unknown;
}

type Handler = (params: any) => Promise<unknown>;

const handlers: Record<string, Handler> = {
	'auth.status': () => getAuthStatus(),
	'auth.login': async (params: { tenant?: string } = {}) => {
		const result = await login(params.tenant);
		scheduleModifiedCountRefresh();
		return result;
	},
	'auth.logout': async () => {
		await logout();
		scheduleModifiedCountRefresh();
	},
	'dataverse.listEnvironments': () => listEnvironments(),
	'dataverse.listSolutions': (params: { orgApiUrl: string }) => listSolutions(params.orgApiUrl),
	'dataverse.listWebResourcesForSolution': (params: { orgApiUrl: string; solutionId: string }) =>
		listWebResourcesForSolution(params.orgApiUrl, params.solutionId),
	'dataverse.getWebResourceDetails': (params: { orgApiUrl: string; webresourceId: string }) =>
		getWebResourceDetails(params.orgApiUrl, params.webresourceId),
	'dataverse.getWebResourceContent': (params: { orgApiUrl: string; webresourceId: string }) =>
		getWebResourceContent(params.orgApiUrl, params.webresourceId),
	'dataverse.updateWebResourceContent': (params: { orgApiUrl: string; webresourceId: string; base64Content: string }) =>
		updateWebResourceContent(params.orgApiUrl, params.webresourceId, params.base64Content),
	'dataverse.publishWebResources': async (params: { orgApiUrl: string; webresourceIds: string[] }) => {
		await publishWebResources(params.orgApiUrl, params.webresourceIds);
		scheduleModifiedCountRefresh();
	},
	'dataverse.createWebResource': (params: {
		orgApiUrl: string;
		solutionUniqueName: string;
		resource: { name: string; displayname: string; webresourcetype: number; content: string };
	}) => createWebResource(params.orgApiUrl, params.solutionUniqueName, params.resource),
	'workspace.listFiles': () => listWorkspaceFiles(),
	'workspace.getFileContent': (params: { path: string }) => getWorkspaceFileContent(params.path),
	'links.list': async () => listLinks(),
	'links.create': async (params: Omit<ResourceLink, 'id'>) => {
		const link = await createLink(params);
		scheduleModifiedCountRefresh();
		return link;
	},
	'links.delete': async (params: { id: string }) => {
		await deleteLink(params.id);
		scheduleModifiedCountRefresh();
	},
	'compare.openDiff': (params: { orgApiUrl: string; webresourceId: string; webresourceName: string; localPath: string }) =>
		openCompareDiff(params),
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
