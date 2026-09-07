import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';

export interface ResourceLink {
	id: string;
	environmentId: string;
	solutionUniqueName: string;
	webresourceId: string;
	webresourceName: string;
	localPath: string;
}

const STORAGE_KEY = 'wrsync.resourceLinks';

let workspaceState: vscode.Memento;

/** Must be called once from activate() before any other function in this module is used.
 * Links are stored in workspaceState rather than a config file on disk (as the original
 * desktop app did) - VS Code already scopes this per opened folder, which is exactly the
 * scope a link (web resource <-> file in this workspace) needs. */
export function initLinksStore(context: vscode.ExtensionContext): void {
	workspaceState = context.workspaceState;
}

export function listLinks(): ResourceLink[] {
	return workspaceState.get<ResourceLink[]>(STORAGE_KEY, []);
}

/** A web resource can only be linked to one local file at a time - creating a new link for
 * the same webresourceId replaces whatever it was linked to before. */
export async function createLink(link: Omit<ResourceLink, 'id'>): Promise<ResourceLink> {
	const links = listLinks().filter((l) => l.webresourceId !== link.webresourceId);
	const newLink: ResourceLink = { id: randomUUID(), ...link };
	links.push(newLink);
	await workspaceState.update(STORAGE_KEY, links);
	return newLink;
}

export async function deleteLink(id: string): Promise<void> {
	const links = listLinks().filter((l) => l.id !== id);
	await workspaceState.update(STORAGE_KEY, links);
}
