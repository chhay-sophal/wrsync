import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { getAccessTokenSilent } from './auth';
import { findWebResourcesByName, type DataverseEnvironment, type WebResource } from './dataverseClient';
import { parseSharedFile, SHARED_FILE_NAME, upsertLinks, withEnvironment, withLinks, type SharedFile, type SharedLink } from './sharedLinks';

export interface ResourceLink {
	id: string;
	environmentId: string;
	solutionUniqueName: string;
	webresourceId: string;
	webresourceName: string;
	localPath: string;
}

const STORAGE_KEY = 'wrsync.resourceLinks';
const SHARED_ID_PREFIX = 'shared:';

let workspaceState: vscode.Memento;

/** dataverse.json's content when the workspace has one; links then live there, for the whole team. */
let shared: SharedFile | undefined;

let initialLoad: Promise<void> = Promise.resolve();

/** Resolves once dataverse.json (if any) has been read at startup. */
export function sharedFileLoaded(): Promise<void> {
	return initialLoad;
}

/** Per environment: what's known about the web resources that shared links name. Shared links
 * are by name, so they apply in every environment, once the name is matched to that
 * environment's record. */
interface KnownEnvironment {
	apiUrl: string;
	solutionUniqueName: string;
	/** Lowercased name -> the record, for names found in the environment. */
	records: Map<string, Pick<WebResource, 'webresourceid' | 'name'>>;
	/** Lowercased names already looked up (found or not), so they aren't queried again. */
	lookedUp: Set<string>;
}
const environments = new Map<string, KnownEnvironment>();

const linksChanged = new vscode.EventEmitter<void>();
/** Fires after any link is created or deleted, from whichever webview did it, and when
 * dataverse.json changes or its links are matched to another environment's records. */
export const onDidChangeLinks = linksChanged.event;

const nameKey = (name: string) => name.toLowerCase();

function sharedFileUri(): vscode.Uri | undefined {
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder ? vscode.Uri.joinPath(folder.uri, SHARED_FILE_NAME) : undefined;
}

/** Must be called once from activate() before any other function in this module is used.
 * Without a dataverse.json, links are stored in workspaceState: VS Code already scopes this per
 * opened folder, which is the scope a link (web resource <-> file in this workspace) needs, but
 * only on this machine. With one, they're committed with the code and shared by the team. */
export function initLinksStore(context: vscode.ExtensionContext): void {
	workspaceState = context.workspaceState;
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (folder) {
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, SHARED_FILE_NAME));
		const reload = () => void loadSharedFile().then(() => resolveAllEnvironments());
		context.subscriptions.push(watcher, watcher.onDidCreate(reload), watcher.onDidChange(reload), watcher.onDidDelete(reload));
	}
	context.subscriptions.push(linksChanged);
	initialLoad = loadSharedFile();
}

async function readSharedText(): Promise<string | undefined> {
	const uri = sharedFileUri();
	if (!uri) {return undefined;}
	try {
		return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
	} catch (err) {
		if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {return undefined;}
		throw err;
	}
}

let reportedError: string | undefined;

async function loadSharedFile(): Promise<void> {
	try {
		const text = await readSharedText();
		shared = text === undefined ? undefined : parseSharedFile(text);
		reportedError = undefined;
	} catch (err) {
		// Keep shared mode (links must not silently move back to this machine), with no links
		// until the file is fixed; saving links refuses rather than overwrite it.
		shared = { environment: undefined, links: [] };
		const message = (err as Error).message;
		if (message !== reportedError) {
			reportedError = message;
			vscode.window.showWarningMessage(`Web resource links are unavailable: ${message}`);
		}
	}
	changed();
}

function changed(): void {
	vscode.commands.executeCommand('setContext', 'wrsync.sharedLinks', shared !== undefined);
	vscode.commands.executeCommand('setContext', 'wrsync.hasLocalLinks', listLocalLinks().length > 0);
	linksChanged.fire();
}

/** Whether links are kept in the workspace's dataverse.json rather than on this machine. */
export function usesSharedFile(): boolean {
	return shared !== undefined;
}

/** The environment URL in dataverse.json (https://org.crm.dynamics.com), if any. */
export function sharedEnvironmentUrl(): string | undefined {
	return shared?.environment;
}

function listLocalLinks(): ResourceLink[] {
	return workspaceState.get<ResourceLink[]>(STORAGE_KEY, []);
}

export function listLinks(): ResourceLink[] {
	if (!shared) {return listLocalLinks();}
	const links: ResourceLink[] = [];
	for (const [environmentId, environment] of environments) {
		for (const link of shared.links) {
			const record = environment.records.get(nameKey(link.name));
			if (!record) {continue;}
			links.push({
				id: SHARED_ID_PREFIX + nameKey(link.name),
				environmentId,
				solutionUniqueName: environment.solutionUniqueName,
				webresourceId: record.webresourceid,
				webresourceName: record.name,
				localPath: link.file,
			});
		}
	}
	return links;
}

function knownEnvironment(environmentId: string, apiUrl: string, solutionUniqueName: string): KnownEnvironment {
	let environment = environments.get(environmentId);
	if (!environment) {
		environment = { apiUrl, solutionUniqueName, records: new Map(), lookedUp: new Set() };
		environments.set(environmentId, environment);
	}
	environment.apiUrl = apiUrl;
	environment.solutionUniqueName = solutionUniqueName;
	return environment;
}

/** Called by the tree once it has loaded a solution's web resources: matches shared links to
 * them, then looks up the names of any other shared links in the environment (a link can point
 * at a web resource outside the solution being viewed). */
export async function useEnvironment(
	environment: Pick<DataverseEnvironment, 'id' | 'apiUrl'>,
	solutionUniqueName: string,
	resources: Pick<WebResource, 'webresourceid' | 'name'>[]
): Promise<void> {
	const known = knownEnvironment(environment.id, environment.apiUrl, solutionUniqueName);
	for (const resource of resources) {
		known.records.set(nameKey(resource.name), { webresourceid: resource.webresourceid, name: resource.name });
		known.lookedUp.add(nameKey(resource.name));
	}
	if (shared) {changed();}
	await lookUpMissing(known);
}

async function lookUpMissing(environment: KnownEnvironment): Promise<void> {
	const names = (shared?.links ?? []).map((l) => l.name).filter((name) => !environment.lookedUp.has(nameKey(name)));
	if (names.length === 0) {return;}
	// Background work: never pops up a sign-in.
	const token = await getAccessTokenSilent(environment.apiUrl);
	if (!token) {return;}
	try {
		const found = await findWebResourcesByName(environment.apiUrl, names, token);
		names.forEach((name) => environment.lookedUp.add(nameKey(name)));
		found.forEach((record) => environment.records.set(nameKey(record.name), record));
		if (found.length > 0) {changed();}
	} catch {
		// Offline or no access: tried again when the links or the solution change.
	}
}

function resolveAllEnvironments(): Promise<unknown> {
	return Promise.all([...environments.values()].map(lookUpMissing));
}

async function saveSharedLinks(links: SharedLink[]): Promise<void> {
	const uri = sharedFileUri();
	if (!uri) {throw new Error('No workspace folder is open');}
	const text = withLinks((await readSharedText()) ?? '', links);
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
	shared = parseSharedFile(text);
	changed();
}

/** Records the record behind a link made in this session, so it shows without a lookup. */
function rememberRecords(links: Omit<ResourceLink, 'id'>[]): void {
	for (const link of links) {
		const environment = environments.get(link.environmentId);
		environment?.records.set(nameKey(link.webresourceName), { webresourceid: link.webresourceId, name: link.webresourceName });
		environment?.lookedUp.add(nameKey(link.webresourceName));
	}
}

/** A web resource can only be linked to one local file at a time - creating a new link for
 * the same webresourceId replaces whatever it was linked to before. */
export async function createLink(link: Omit<ResourceLink, 'id'>): Promise<ResourceLink> {
	return (await createLinks([link]))[0];
}

/** Creates several links in one read-modify-write (used by "Suggest links"), with the same
 * replace-by-webresourceId rule as createLink. Shared links are replaced by name, which is the
 * same thing within an environment. */
export async function createLinks(newLinks: Omit<ResourceLink, 'id'>[]): Promise<ResourceLink[]> {
	if (shared) {
		rememberRecords(newLinks);
		await saveSharedLinks(upsertLinks(shared.links, newLinks.map((l) => ({ name: l.webresourceName, file: l.localPath }))));
		return newLinks.map((l) => ({ id: SHARED_ID_PREFIX + nameKey(l.webresourceName), ...l }));
	}
	const replacedIds = new Set(newLinks.map((l) => l.webresourceId));
	const created = newLinks.map((l): ResourceLink => ({ id: randomUUID(), ...l }));
	const links = [...listLocalLinks().filter((l) => !replacedIds.has(l.webresourceId)), ...created];
	await workspaceState.update(STORAGE_KEY, links);
	changed();
	return created;
}

export async function deleteLink(id: string): Promise<void> {
	if (shared && id.startsWith(SHARED_ID_PREFIX)) {
		await saveSharedLinks(upsertLinks(shared.links, [{ name: id.slice(SHARED_ID_PREFIX.length), file: null }]));
		return;
	}
	const links = listLocalLinks().filter((l) => l.id !== id);
	await workspaceState.update(STORAGE_KEY, links);
	changed();
}

/**
 * Moves the links stored on this machine into dataverse.json (creating it if needed), so the
 * team shares them. Links already in the file win over local ones for the same web resource;
 * among local ones, those for `current` win (links made in other environments may differ).
 * Sets the file's environment to `current` if it has none. Returns how many links were added.
 */
export async function moveLocalLinksToSharedFile(current: Pick<DataverseEnvironment, 'id'> | undefined, environmentUrl: string | undefined): Promise<number> {
	const uri = sharedFileUri();
	if (!uri) {throw new Error('No workspace folder is open');}
	let text = (await readSharedText()) ?? '';
	const existing = parseSharedFile(text);
	if (environmentUrl) {text = withEnvironment(text, environmentUrl);}

	const local = listLocalLinks();
	const ordered = [...local.filter((l) => l.environmentId !== current?.id), ...local.filter((l) => l.environmentId === current?.id)];
	const taken = new Set(existing.links.map((l) => nameKey(l.name)));
	const additions = ordered.filter((l) => !taken.has(nameKey(l.webresourceName)));
	const links = upsertLinks(existing.links, additions.map((l) => ({ name: l.webresourceName, file: l.localPath })));
	text = withLinks(text, links);

	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
	shared = parseSharedFile(text);
	rememberRecords(local);
	await workspaceState.update(STORAGE_KEY, []);
	changed();
	return new Set(additions.map((l) => nameKey(l.webresourceName))).size;
}

/** Links still stored on this machine (ignored while dataverse.json is in use). */
export function localLinkCount(): number {
	return listLocalLinks().length;
}
