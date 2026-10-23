import * as vscode from 'vscode';
import { getAccessTokenSilent, getAuthStatus, POWER_PLATFORM_RESOURCE } from './auth';
import { getWebResourceContents, toApiUrl } from './dataverseClient';
import { watchWorkspaceFiles } from './fileWatcher';
import { listLinks, type ResourceLink } from './linksStore';

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

/** Compares each link's local file with its content in one Dataverse environment, fetching
 * all the contents in batched requests rather than one per link. Used for both the cards'
 * Modified state (via RPC) and the Activity Bar badge, so the two always agree. Links whose
 * local file or Dataverse content can't be read right now are left out of the result rather
 * than guessed. Throws only if the Dataverse request itself fails. */
export async function checkLinksModified(
	orgApiUrl: string,
	links: Pick<ResourceLink, 'webresourceId' | 'localPath'>[],
	token?: string
): Promise<Record<string, boolean>> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder || links.length === 0) {return {};}
	const contents = await getWebResourceContents(orgApiUrl, links.map((l) => l.webresourceId), token);
	const result: Record<string, boolean> = {};
	await Promise.all(
		links.map(async (link) => {
			const remoteBase64 = contents.get(link.webresourceId.toLowerCase());
			if (remoteBase64 === undefined) {return;}
			try {
				const localBytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, link.localPath));
				const localText = Buffer.from(localBytes).toString('utf-8');
				const remoteText = Buffer.from(remoteBase64, 'base64').toString('utf-8');
				result[link.webresourceId] = normalizeForCompare(localText) !== normalizeForCompare(remoteText);
			} catch {
				// Local file unreadable (e.g. just deleted) - leave it out for this pass.
			}
		})
	);
	return result;
}

/** Ignores CRLF vs LF line endings and a leading UTF-8 BOM when comparing, so a Windows
 * checkout (core.autocrlf) of content saved elsewhere with LF isn't counted as modified.
 * Keep in sync with normalizeForCompare in webview-ui/src/lib/text.ts, which the "Suggested
 * links" page uses to confirm candidates by content. */
function normalizeForCompare(text: string): string {
	const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	return withoutBom.replace(/\r\n?/g, '\n');
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

	// One batched check per environment. A failed environment (no silent token, request error)
	// just contributes nothing to this pass rather than failing the whole count.
	const linksByApiUrl = new Map<string, ResourceLink[]>();
	for (const link of links) {
		const apiUrl = apiUrlByEnvironmentId.get(link.environmentId);
		if (apiUrl) {linksByApiUrl.set(apiUrl, [...(linksByApiUrl.get(apiUrl) ?? []), link]);}
	}
	const counts = await Promise.all(
		[...linksByApiUrl].map(async ([apiUrl, envLinks]) => {
			const token = await getAccessTokenSilent(apiUrl);
			if (!token) {return 0;}
			try {
				const modified = await checkLinksModified(apiUrl, envLinks, token);
				return Object.values(modified).filter(Boolean).length;
			} catch {
				return 0;
			}
		})
	);
	setBadge(counts.reduce((sum, n) => sum + n, 0));
}

function setBadge(count: number): void {
	if (!currentWebviewView) {return;}
	currentWebviewView.badge = count > 0 ? { value: count, tooltip: `${count} modified web resource(s)` } : undefined;
}
