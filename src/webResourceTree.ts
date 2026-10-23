import * as vscode from 'vscode';
import { getAuthStatus } from './auth';
import { getWebResourceDetails, listWebResourcesForSolution, type WebResource } from './dataverseClient';
import { watchWorkspaceFiles } from './fileWatcher';
import { listLinks, onDidChangeLinks, type ResourceLink } from './linksStore';
import { checkLinksModified, onDidChangeRemoteContent } from './modifiedTracker';
import { filtersActive, getEnvironment, getFilters, getSolution, getSort, onDidChangeState } from './state';
import { isLinkableFile, linkableExtensions, typeLabel } from './webResourceTypes';

/** Gives each tree item a resourceUri so VS Code treats it like a file: the icon theme picks an
 * icon from the name's extension, and the decoration provider below adds the "M" badge and
 * colour exactly the way Git marks modified files in Explorer. */
const SCHEME = 'wrsync-webresource';

/** One web resource in the tree, with everything its item, menus and commands need. */
export interface WebResourceNode {
	resource: WebResource;
	link: ResourceLink | undefined;
	/** Linked file differs from Dataverse (false when not linked or not checked yet). */
	modified: boolean;
	/** Linked to a file whose type doesn't match (a link made before type checks existed). */
	mismatched: boolean;
	/** The type can be linked at all (false for binary types). */
	linkable: boolean;
}

/** Linked, out of sync, and safe to publish/pull/compare. */
export function canSync(node: WebResourceNode): boolean {
	return node.link !== undefined && node.modified && !node.mismatched;
}

function resourceUri(resource: WebResource): vscode.Uri {
	return vscode.Uri.from({ scheme: SCHEME, path: `/${resource.name}`, query: resource.webresourceid });
}

/** Item state for package.json menu `when` clauses (`viewItem =~ /;modified;/` etc.). */
function contextValue(node: WebResourceNode): string {
	const flags = ['webresource'];
	if (node.link) {flags.push('linked');}
	else if (node.linkable) {flags.push('linkable');}
	if (canSync(node)) {flags.push('syncable');}
	if (node.mismatched) {flags.push('mismatched');}
	return `;${flags.join(';')};`;
}

function sortValue(r: WebResource, column: string): string {
	switch (column) {
		case 'displayname':
			return r.displayname;
		case 'type':
			return typeLabel(r.webresourcetype);
		case 'managed':
			return r.ismanaged ? 'Managed' : 'Unmanaged';
		default:
			return r.name;
	}
}

/** The native "Web Resources" tree: the current solution's web resources, their links and
 * Modified state. Owns loading (resources from Dataverse, links from the store) and keeps the
 * Modified state current as links, linked files and Dataverse content change. */
export class WebResourceTree
	implements vscode.TreeDataProvider<WebResourceNode>, vscode.FileDecorationProvider, vscode.Disposable
{
	readonly view: vscode.TreeView<WebResourceNode>;

	private resources: WebResource[] | undefined;
	private nodes = new Map<string, WebResourceNode>();
	private modified = new Map<string, boolean>();
	private loadError: string | undefined;
	private loadGeneration = 0;
	private readonly disposables: vscode.Disposable[] = [];

	private readonly treeChanged = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.treeChanged.event;
	private readonly decorationsChanged = new vscode.EventEmitter<vscode.Uri[]>();
	readonly onDidChangeFileDecorations = this.decorationsChanged.event;

	constructor() {
		this.view = vscode.window.createTreeView('wrsync.webResources', {
			treeDataProvider: this,
			canSelectMany: true,
			showCollapseAll: false,
		});
		this.disposables.push(
			this.view,
			this.treeChanged,
			this.decorationsChanged,
			vscode.window.registerFileDecorationProvider(this),
			// Environment or solution switched: reload. Filters/sort changed: just re-render.
			onDidChangeState(() => {
				if (this.loadedFor !== this.scopeKey()) {this.reload();}
				else {this.render();}
			}),
			onDidChangeLinks(() => {
				this.render();
				this.checkModified();
			}),
			onDidChangeRemoteContent(() => this.checkModified()),
			this.view.onDidChangeSelection(() => this.updateSelectionContext()),
			watchWorkspaceFiles((event) => {
				const affected = listLinks().filter((l) => l.localPath === event.path);
				if (affected.length > 0) {this.checkModified(affected);}
			})
		);
		this.reload();
	}

	dispose(): void {
		this.disposables.forEach((d) => d.dispose());
	}

	private loadedFor: string | undefined;

	private scopeKey(): string | undefined {
		const environment = getEnvironment();
		const solution = getSolution();
		return environment && solution ? `${environment.id}::${solution.solutionid}` : undefined;
	}

	/** Fetches the current solution's web resources, then checks the linked ones. Stale loads
	 * (the solution changed meanwhile) are discarded. */
	async reload(): Promise<void> {
		const generation = ++this.loadGeneration;
		const environment = getEnvironment();
		const solution = getSolution();
		this.loadedFor = this.scopeKey();
		this.resources = undefined;
		this.loadError = undefined;
		this.modified.clear();
		this.render();
		if (!environment || !solution || !(await getAuthStatus()).signedIn) {return;}

		this.view.message = 'Loading web resources...';
		try {
			const resources = await listWebResourcesForSolution(environment.apiUrl, solution.solutionid);
			if (generation !== this.loadGeneration) {return;}
			this.resources = resources;
		} catch (err) {
			if (generation !== this.loadGeneration) {return;}
			this.loadError = (err as Error).message;
		}
		this.render();
		await this.checkModified();
	}

	/** Re-checks Modified for the given links (default: every link in this environment) with one
	 * batched Dataverse request. A failed check leaves the previous state alone. */
	async checkModified(links?: ResourceLink[]): Promise<void> {
		const environment = getEnvironment();
		if (!environment || !this.resources) {return;}
		const toCheck = (links ?? listLinks()).filter((l) => l.environmentId === environment.id);
		if (toCheck.length === 0) {return;}
		try {
			const result = await checkLinksModified(environment.apiUrl, toCheck);
			if (getEnvironment()?.id !== environment.id) {return;}
			const changedUris: vscode.Uri[] = [];
			for (const [id, isModified] of Object.entries(result)) {
				if (this.modified.get(id) !== isModified) {
					this.modified.set(id, isModified);
					const node = this.nodes.get(id);
					if (node) {changedUris.push(resourceUri(node.resource));}
				}
			}
			if (changedUris.length > 0) {this.render();}
		} catch {
			// Transient failure - keep the last known state rather than guess.
		}
	}

	/** Rebuilds the nodes from the loaded resources, links and Modified state, and refreshes the
	 * tree, its decorations and its title-area texts. */
	private render(): void {
		const environment = getEnvironment();
		const solution = getSolution();
		const linkById = new Map(listLinks().filter((l) => l.environmentId === environment?.id).map((l) => [l.webresourceId, l]));
		this.nodes.clear();
		for (const resource of this.resources ?? []) {
			const link = linkById.get(resource.webresourceid);
			this.nodes.set(resource.webresourceid, {
				resource,
				link,
				modified: link !== undefined && this.modified.get(resource.webresourceid) === true,
				mismatched: link !== undefined && !isLinkableFile(resource.webresourcetype, link.localPath),
				linkable: linkableExtensions(resource.webresourcetype) !== null,
			});
		}

		this.view.description = environment && solution ? `${environment.displayName} · ${solution.friendlyname}` : undefined;
		const filters = getFilters();
		const shown = this.visibleNodes().length;
		if (this.loadError) {
			this.view.message = `Couldn't load web resources: ${this.loadError}`;
		} else if (this.resources?.length === 0) {
			this.view.message = 'No web resources in this solution.';
		} else if (this.resources && filtersActive(filters)) {
			this.view.message = shown === 0 ? 'No web resources match the current filters.' : `Filtered: showing ${shown} of ${this.resources.length}.`;
		} else if (this.resources) {
			this.view.message = undefined;
		}
		this.treeChanged.fire();
		this.decorationsChanged.fire([...this.nodes.values()].map((n) => resourceUri(n.resource)));
		this.updateSelectionContext();
	}

	/** The selected nodes as they are now. view.selection keeps the node objects from when they
	 * were selected, so their Modified state can be stale after a re-check. */
	currentSelection(): WebResourceNode[] {
		return this.current(this.view.selection);
	}

	/** Maps nodes (e.g. passed to a command by a menu) to their current versions. */
	current(nodes: readonly WebResourceNode[]): WebResourceNode[] {
		return nodes.map((n) => this.nodes.get(n.resource.webresourceid) ?? n);
	}

	/** `wrsync.selectionHasSyncable` shows "Publish Selected" (title bar, context menu, Command
	 * Palette) while the selection includes something publishable. */
	private updateSelectionContext(): void {
		vscode.commands.executeCommand('setContext', 'wrsync.selectionHasSyncable', this.currentSelection().some(canSync));
	}

	/** Nodes after the current filters and sort, in display order. */
	visibleNodes(): WebResourceNode[] {
		const filters = getFilters();
		let list = [...this.nodes.values()].filter(
			(n) =>
				(filters.types.length === 0 || filters.types.includes(n.resource.webresourcetype)) &&
				(filters.managed === 'all' || (filters.managed === 'managed') === n.resource.ismanaged) &&
				(!filters.modifiedOnly || n.modified) &&
				(!filters.linkedOnly || n.link !== undefined)
		);
		const sort = getSort() ?? { column: 'name', direction: 'asc' };
		const dir = sort.direction === 'asc' ? 1 : -1;
		list = list.sort((a, b) => sortValue(a.resource, sort.column).localeCompare(sortValue(b.resource, sort.column)) * dir);
		return list;
	}

	/** All loaded nodes regardless of filters (e.g. for Suggest Links). */
	allNodes(): WebResourceNode[] {
		return [...this.nodes.values()];
	}

	/** Types present in the loaded solution, for the type filter. */
	presentTypes(): number[] {
		return [...new Set((this.resources ?? []).map((r) => r.webresourcetype))].sort((a, b) => a - b);
	}

	/** Number of modified resources in the current solution. */
	modifiedCount(): number {
		return [...this.nodes.values()].filter((n) => n.modified).length;
	}

	getChildren(element?: WebResourceNode): WebResourceNode[] {
		// Empty while signed out or with no solution picked - the view's welcome content
		// (package.json viewsWelcome) takes over then.
		return element ? [] : this.visibleNodes();
	}

	getTreeItem(node: WebResourceNode): vscode.TreeItem {
		const { resource, link } = node;
		const item = new vscode.TreeItem(resource.name, vscode.TreeItemCollapsibleState.None);
		item.id = resource.webresourceid; // Keeps selection and focus across refreshes.
		item.resourceUri = resourceUri(resource);
		item.iconPath = vscode.ThemeIcon.File;
		item.description = link?.localPath;
		item.contextValue = contextValue(node);
		// Click: compare a modified resource; open the local file of an in-sync linked one.
		if (canSync(node)) {
			item.command = { command: 'wrsync.compare', title: 'Compare', arguments: [node] };
		} else if (link && !node.mismatched) {
			item.command = { command: 'wrsync.openLocalFile', title: 'Open Local File', arguments: [node] };
		}
		item.tooltip = this.tooltip(node);
		return item;
	}

	/** Adds "last modified by" to the hover only when it's shown - one request per hovered item
	 * rather than one per item in the list. */
	async resolveTreeItem(item: vscode.TreeItem, node: WebResourceNode): Promise<vscode.TreeItem> {
		const environment = getEnvironment();
		if (!environment) {return item;}
		try {
			const details = await getWebResourceDetails(environment.apiUrl, node.resource.webresourceid);
			const when = details.modifiedon ? new Date(details.modifiedon).toLocaleString() : 'unknown time';
			item.tooltip = this.tooltip(node, `Last modified in Dataverse by ${details.modifiedbyname ?? 'unknown'}, ${when}`);
		} catch {
			// Keep the basic tooltip.
		}
		return item;
	}

	private tooltip(node: WebResourceNode, extraLine?: string): vscode.MarkdownString {
		const { resource, link } = node;
		const md = new vscode.MarkdownString(undefined, true);
		md.appendMarkdown(`**${escapeMd(resource.name)}**\n\n`);
		md.appendMarkdown(`${escapeMd(resource.displayname)} · ${typeLabel(resource.webresourcetype)} · ${resource.ismanaged ? 'Managed' : 'Unmanaged'}\n\n`);
		if (link) {
			md.appendMarkdown(`$(link) \`${escapeMd(link.localPath)}\`\n\n`);
			if (node.mismatched) {
				md.appendMarkdown(`$(error) This file type can't be published to a ${typeLabel(resource.webresourcetype)} web resource. Unlink it and link a matching file.\n\n`);
			} else if (node.modified) {
				md.appendMarkdown('$(diff-modified) Modified: the local file differs from Dataverse. Click to compare.\n\n');
			} else {
				md.appendMarkdown('$(check) In sync with Dataverse.\n\n');
			}
		} else {
			md.appendMarkdown(node.linkable ? 'Not linked to a local file.\n\n' : `${typeLabel(resource.webresourcetype)}: linking not supported.\n\n`);
		}
		if (extraLine) {md.appendMarkdown(escapeMd(extraLine));}
		return md;
	}

	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		if (uri.scheme !== SCHEME) {return undefined;}
		const node = this.nodes.get(uri.query);
		if (!node) {return undefined;}
		if (node.mismatched) {
			return new vscode.FileDecoration('!', 'Linked file type doesn\'t match', new vscode.ThemeColor('list.errorForeground'));
		}
		if (node.modified) {
			return new vscode.FileDecoration('M', 'Modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
		}
		return undefined;
	}
}

function escapeMd(text: string): string {
	return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}
