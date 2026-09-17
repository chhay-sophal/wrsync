import * as vscode from 'vscode';
import { getAccessTokenSilent, getAuthStatus, POWER_PLATFORM_RESOURCE } from './auth';
import { toApiUrl } from './dataverseClient';
import { watchWorkspaceFiles } from './fileWatcher';
import { listLinks, type ResourceLink } from './linksStore';

const API_VERSION = 'v9.2';
const DEBOUNCE_MS = 500;

let currentWebviewView: vscode.WebviewView | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Sets which webview view's Activity Bar badge reflects the modified-file count. Called
 * whenever the sidebar view is (re)resolved, and cleared when it's disposed. */
export function setBadgeTarget(webviewView: vscode.WebviewView | undefined): void {
	currentWebviewView = webviewView;
}

/** Debounced trigger for a full recompute — coalesces bursts of file-save events and rapid
 * successive RPC calls (e.g. publishing several resources in a row) into one pass. */
export function scheduleModifiedCountRefresh(): void {
	if (debounceTimer) {clearTimeout(debounceTimer);}
	debounceTimer = setTimeout(() => {
		debounceTimer = undefined;
		refreshModifiedCount();
	}, DEBOUNCE_MS);
}

/** Starts the file watcher that keeps the badge live even while the sidebar view isn't the
 * visible one (switching to Explorer, Source Control, etc. doesn't stop extension-host code,
 * only the webview's own suspended scripts) and does a first pass so the badge is right as
 * soon as the extension activates. */
export function initModifiedTracker(context: vscode.ExtensionContext): void {
	const watcher = watchWorkspaceFiles((event) => {
		if (listLinks().some((link) => link.localPath === event.path)) {
			scheduleModifiedCountRefresh();
		}
	});
	context.subscriptions.push(watcher);
	scheduleModifiedCountRefresh();
}

async function listEnvironmentApiUrlsSilent(): Promise<Map<string, string> | null> {
	const token = await getAccessTokenSilent(POWER_PLATFORM_RESOURCE);
	if (!token) {return null;}
	try {
		const res = await fetch(
			`${POWER_PLATFORM_RESOURCE}/environmentmanagement/environments?api-version=2024-10-01`,
			{ headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
		);
		if (!res.ok) {return null;}
		const data = (await res.json()) as { value: { id: string; url: string }[] };
		const apiUrlByEnvironmentId = new Map<string, string>();
		for (const env of data.value) {
			if (env.url) {apiUrlByEnvironmentId.set(env.id, toApiUrl(env.url.replace(/\/+$/, '')));}
		}
		return apiUrlByEnvironmentId;
	} catch {
		return null;
	}
}

async function getWebResourceContentSilent(orgApiUrl: string, webresourceId: string): Promise<string | null> {
	const token = await getAccessTokenSilent(orgApiUrl);
	if (!token) {return null;}
	try {
		const res = await fetch(`${orgApiUrl}/api/data/${API_VERSION}/webresourceset(${webresourceId})?$select=content`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
				'OData-MaxVersion': '4.0',
				'OData-Version': '4.0',
			},
		});
		if (!res.ok) {return null;}
		const data = (await res.json()) as { content: string };
		return data.content;
	} catch {
		return null;
	}
}

/** Resolves null (rather than throwing) for any link whose local file, environment, or
 * published content can't be read right now — a transient failure here should just leave
 * that one link out of the count for this pass, not blow up the whole recompute. */
async function isLinkModified(
	link: ResourceLink,
	apiUrl: string,
	folder: vscode.WorkspaceFolder
): Promise<boolean | null> {
	try {
		const [localBytes, remoteBase64] = await Promise.all([
			vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, link.localPath)),
			getWebResourceContentSilent(apiUrl, link.webresourceId),
		]);
		if (remoteBase64 === null) {return null;}
		const localText = Buffer.from(localBytes).toString('utf-8');
		const remoteText = Buffer.from(remoteBase64, 'base64').toString('utf-8');
		return localText !== remoteText;
	} catch {
		return null;
	}
}

async function refreshModifiedCount(): Promise<void> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	const { signedIn } = await getAuthStatus();
	if (!folder || !signedIn) {
		setBadge(0);
		return;
	}

	const links = listLinks();
	if (links.length === 0) {
		setBadge(0);
		return;
	}

	const apiUrlByEnvironmentId = await listEnvironmentApiUrlsSilent();
	if (!apiUrlByEnvironmentId) {
		// No cached token available right now (e.g. it needs interactive re-consent) — leave
		// the last known badge alone rather than flash it to zero.
		return;
	}

	const results = await Promise.all(
		links.map((link) => {
			const apiUrl = apiUrlByEnvironmentId.get(link.environmentId);
			return apiUrl ? isLinkModified(link, apiUrl, folder) : Promise.resolve(null);
		})
	);
	setBadge(results.filter((modified) => modified === true).length);
}

function setBadge(count: number): void {
	if (!currentWebviewView) {return;}
	currentWebviewView.badge = count > 0 ? { value: count, tooltip: `${count} modified web resource(s)` } : undefined;
}
