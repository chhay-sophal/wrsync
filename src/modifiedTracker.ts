import * as vscode from 'vscode';
import { getAccessTokenSilent, getAuthStatus, POWER_PLATFORM_RESOURCE } from './auth';
import { getWebResourceContents, toApiUrl } from './dataverseClient';
import { watchWorkspaceFiles } from './fileWatcher';
import { listLinks, onDidChangeLinks, type ResourceLink } from './linksStore';
import { getEnvironment } from './state';
import { normalizeForCompare } from './textCompare';

/** Saves of the same file within this window (e.g. auto-save while typing) are checked once. */
const FILE_DEBOUNCE_MS = 300;

/**
 * The Modified state of every link - the single source for the tree's M marks and the
 * Activity Bar badge, so the two always agree and nothing is checked twice.
 *
 * Checking means downloading Dataverse content, so it's kept incremental: a full check only on
 * startup, sign-in and Refresh; otherwise only what changed - a saved file's links, added or
 * re-pointed links, just-published resources. Keyed by environment + web resource; each entry
 * remembers which local path it was checked against, so re-pointing a link re-checks it.
 */
const states = new Map<string, { localPath: string; modified: boolean }>();
/** Latest check number per key, so a slow, older check can't overwrite a newer result. */
const latestCheck = new Map<string, number>();
let checkCounter = 0;
/** Environment id -> Web API URL for the session; the environment list is a Power Platform call. */
let apiUrlCache: Map<string, string> | undefined;

const modifiedChanged = new vscode.EventEmitter<void>();
/** Fires whenever any link's Modified state changes. */
export const onDidChangeModified = modifiedChanged.event;

/** Anything with a view badge - the "Web Resources" tree view. */
type BadgeTarget = { badge?: vscode.ViewBadge };
let badgeTarget: BadgeTarget | undefined;

const keyOf = (link: Pick<ResourceLink, 'environmentId' | 'webresourceId'>) => `${link.environmentId}::${link.webresourceId}`;

/** Whether the link's local file differs from Dataverse (false until it's been checked). */
export function isLinkModified(link: ResourceLink): boolean {
	const state = states.get(keyOf(link));
	return state !== undefined && state.localPath === link.localPath && state.modified;
}

/** Sets which view's badge (shown on the Activity Bar icon) reflects the modified count. */
export function setBadgeTarget(target: BadgeTarget | undefined): void {
	badgeTarget = target;
	updateBadge();
}

/** Starts watching linked files and link changes, and does the startup check. */
export function initModifiedTracker(context: vscode.ExtensionContext): void {
	const fileTimers = new Map<string, ReturnType<typeof setTimeout>>();
	context.subscriptions.push(
		watchWorkspaceFiles((event) => {
			if (!listLinks().some((l) => l.localPath === event.path)) {return;}
			clearTimeout(fileTimers.get(event.path));
			fileTimers.set(
				event.path,
				setTimeout(() => {
					fileTimers.delete(event.path);
					recheck(listLinks().filter((l) => l.localPath === event.path));
				}, FILE_DEBOUNCE_MS)
			);
		}),
		onDidChangeLinks(() => syncWithLinks()),
		modifiedChanged,
		{ dispose: () => fileTimers.forEach((t) => clearTimeout(t)) }
	);
	recheckAll();
}

/** Full check of every link - startup and sign-in. */
export function recheckAll(): Promise<void> {
	return recheck(listLinks());
}

/** Full check of one environment's links - the tree's Refresh. */
export function recheckEnvironment(environmentId: string): Promise<void> {
	return recheck(listLinks().filter((l) => l.environmentId === environmentId));
}

/** Checks the environment's links that have never been checked - e.g. the startup check had no
 * silent token for it yet. Called once the tree has loaded a solution; usually a no-op. */
export function checkUnchecked(environmentId: string): Promise<void> {
	return recheck(listLinks().filter((l) => l.environmentId === environmentId && !states.has(keyOf(l))));
}

/** After a publish: only the published resources can have changed in Dataverse. */
export function recheckWebResources(webresourceIds: string[]): Promise<void> {
	const ids = new Set(webresourceIds.map((id) => id.toLowerCase()));
	return recheck(listLinks().filter((l) => ids.has(l.webresourceId.toLowerCase())));
}

/** On sign-out: forget everything (it belongs to the signed-in account). */
export function forgetAll(): void {
	states.clear();
	latestCheck.clear();
	apiUrlCache = undefined;
	changed();
}

/** Links were added, removed or re-pointed: drop states for links that are gone and check only
 * the new or re-pointed ones - no re-download of everything else. */
function syncWithLinks(): void {
	const links = listLinks();
	const current = new Map(links.map((l) => [keyOf(l), l]));
	let removed = false;
	for (const key of states.keys()) {
		if (!current.has(key)) {
			states.delete(key);
			removed = true;
		}
	}
	if (removed) {changed();}
	recheck(links.filter((l) => states.get(keyOf(l))?.localPath !== l.localPath));
}

/** Checks the given links with one batched content download per environment, using silent
 * tokens only (this runs in the background). Links that can't be checked right now keep their
 * last known state. */
async function recheck(links: ResourceLink[]): Promise<void> {
	if (links.length === 0 || !(await getAuthStatus()).signedIn) {return;}
	const checkIds = new Map(links.map((l) => [keyOf(l), ++checkCounter]));
	checkIds.forEach((id, key) => latestCheck.set(key, id));

	const apiUrls = await resolveApiUrls([...new Set(links.map((l) => l.environmentId))]);
	const byEnvironment = new Map<string, ResourceLink[]>();
	for (const link of links) {
		byEnvironment.set(link.environmentId, [...(byEnvironment.get(link.environmentId) ?? []), link]);
	}

	let anyChanged = false;
	await Promise.all(
		[...byEnvironment].map(async ([environmentId, envLinks]) => {
			const apiUrl = apiUrls.get(environmentId);
			const token = apiUrl ? await getAccessTokenSilent(apiUrl) : null;
			if (!apiUrl || !token) {return;}
			let result: Record<string, boolean>;
			try {
				result = await checkLinksModified(apiUrl, envLinks, token);
			} catch {
				return; // Transient failure - keep the last known state.
			}
			for (const link of envLinks) {
				const key = keyOf(link);
				if (latestCheck.get(key) !== checkIds.get(key) || !(link.webresourceId in result)) {continue;}
				const next = { localPath: link.localPath, modified: result[link.webresourceId] };
				const previous = states.get(key);
				if (previous?.localPath !== next.localPath || previous.modified !== next.modified) {
					states.set(key, next);
					anyChanged = true;
				}
			}
		})
	);
	if (anyChanged) {changed();}
}

/** Web API URLs for the given environments. The current environment's is already known, and
 * the rest are cached for the session, so the environment list is fetched at most once - and
 * not at all when every link is in the current environment. */
async function resolveApiUrls(environmentIds: string[]): Promise<Map<string, string>> {
	const urls = new Map(apiUrlCache ?? []);
	const current = getEnvironment();
	if (current) {urls.set(current.id, current.apiUrl);}
	if (environmentIds.some((id) => !urls.has(id))) {
		const fetched = await listEnvironmentApiUrlsSilent();
		if (fetched) {
			apiUrlCache = fetched;
			fetched.forEach((url, id) => urls.set(id, url));
		}
	}
	return urls;
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
 * all the contents in batched requests rather than one per link. Links whose local file or
 * Dataverse content can't be read right now are left out of the result rather than guessed.
 * Throws only if the Dataverse request itself fails. */
async function checkLinksModified(
	orgApiUrl: string,
	links: Pick<ResourceLink, 'webresourceId' | 'localPath'>[],
	token: string
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

function changed(): void {
	updateBadge();
	modifiedChanged.fire();
}

function updateBadge(): void {
	if (!badgeTarget) {return;}
	const count = listLinks().filter(isLinkModified).length;
	badgeTarget.badge = count > 0 ? { value: count, tooltip: `${count} modified web resource(s)` } : undefined;
}
