import * as vscode from 'vscode';
import { getAuthStatus } from './auth';
import { getWebResourceContent, getWebResourceDetails, listWebResourcesForSolution, type WebResource } from './dataverseClient';
import { listLinks, onDidChangeLinks, type ResourceLink } from './linksStore';
import { checkUnchecked, isLinkModified, onDidChangeModified } from './modifiedTracker';
import { filtersActive, getEnvironment, getFilters, getSolution, getSort, matchesText, onDidChangeState } from './state';
import {
	imageMimeType,
	isImageType,
	isLinkableFile,
	isSvgType,
	isTextType,
	linkableExtensions,
	nameWithTypeExtension,
	typeLabel,
} from './webResourceTypes';
import type { ItemClickOptions } from './webResourceCommands';

/** Gives each tree item a resourceUri so VS Code treats it like a file: the icon theme picks an
 * icon from the name's extension, and the decoration provider below adds the "M" badge and
 * colour exactly the way Git marks modified files in Explorer. */
const SCHEME = 'wrsync-webresource';

/** Hover thumbnail: the image as a data URI, or a note when it's too big to embed. */
type Thumbnail = { mime: string; base64: string } | 'tooLarge';
/** Embedding is capped so a huge image can't bloat the hover (~375 KB decoded). */
const MAX_THUMBNAIL_BASE64 = 500_000;
const THUMBNAIL_HEIGHT = 96;

/** One web resource in the tree, with everything its item, menus and commands need. */
export interface WebResourceNode {
	resource: WebResource;
	link: ResourceLink | undefined;
	/** Linked file differs from Dataverse (false when not linked or not checked yet). */
	modified: boolean;
	/** Linked to a file whose type doesn't match (a link made before type checks existed). */
	mismatched: boolean;
	/** Can be linked to a local file: an unmanaged resource of a text type. Managed resources
	 * come from installed solutions and are read-only here - view their content instead. */
	linkable: boolean;
	/** View Content can show it: text in a read-only editor, images in the image preview
	 * (false only for XAP packages). */
	viewable: boolean;
}

/** Linked, out of sync, and safe to publish/pull/compare. */
export function canSync(node: WebResourceNode): boolean {
	return node.link !== undefined && node.modified && !node.mismatched && !node.resource.ismanaged;
}

/** The item's identity for icons and decorations. The path ends in the type's extension even
 * when the name has none (e.g. "sync_Lookup" -> "/sync_Lookup.js"), because icon themes pick
 * icons by extension; the label shown is set separately, and decorations look items up by the
 * id in the query. */
function resourceUri(resource: WebResource): vscode.Uri {
	const path = `/${nameWithTypeExtension(resource.name, resource.webresourcetype)}`;
	return vscode.Uri.from({ scheme: SCHEME, path, query: resource.webresourceid });
}

/** Item state for package.json menu `when` clauses (`viewItem =~ /;modified;/` etc.). */
function contextValue(node: WebResourceNode): string {
	const flags = ['webresource'];
	if (node.link) {flags.push('linked');}
	else if (node.linkable) {flags.push('linkable');}
	if (canSync(node)) {flags.push('syncable');}
	if (node.mismatched) {flags.push('mismatched');}
	if (node.viewable) {flags.push('viewable');}
	if (isSvgType(node.resource.webresourcetype)) {flags.push('svg');}
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
	private loadError: string | undefined;
	private loading = false;
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
			// The modified tracker owns checking (on save, link changes, publish); the tree just
			// re-renders when links or their Modified state change.
			onDidChangeLinks(() => this.render()),
			onDidChangeModified(() => this.render()),
			this.view.onDidChangeSelection(() => this.updateSelectionContext())
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
		this.loading = false;
		this.render();
		if (!environment || !solution || !(await getAuthStatus()).signedIn) {return;}
		if (generation !== this.loadGeneration) {return;}

		this.loading = true;
		this.render();
		try {
			const resources = await listWebResourcesForSolution(environment.apiUrl, solution.solutionid);
			if (generation !== this.loadGeneration) {return;}
			this.resources = resources;
		} catch (err) {
			if (generation !== this.loadGeneration) {return;}
			this.loadError = (err as Error).message;
		}
		this.loading = false;
		this.render();
		if (this.resources) {checkUnchecked(environment.id);}
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
				// A managed resource can't be published, so a leftover link never makes it "modified".
				modified: link !== undefined && !resource.ismanaged && isLinkModified(link),
				mismatched: link !== undefined && !isLinkableFile(resource.webresourcetype, link.localPath),
				linkable: !resource.ismanaged && linkableExtensions(resource.webresourcetype) !== null,
				viewable: isTextType(resource.webresourcetype) || isImageType(resource.webresourcetype),
			});
		}

		this.view.description = environment && solution ? `${environment.displayName} · ${solution.friendlyname}` : undefined;
		const filters = getFilters();
		const shown = this.visibleNodes().length;
		// Decided from scratch on every render - every branch assigns, so nothing from a previous
		// state (e.g. "Filtered: ..." before signing out) can linger.
		if (this.loadError) {
			this.view.message = `Couldn't load web resources: ${this.loadError}`;
		} else if (this.loading) {
			this.view.message = 'Loading web resources...';
		} else if (!this.resources) {
			// Signed out or no solution picked: the welcome content explains what to do.
			this.view.message = undefined;
		} else if (this.resources.length === 0) {
			this.view.message = 'No web resources in this solution.';
		} else if (filtersActive(filters)) {
			const search = filters.search.trim() ? ` (search "${filters.search.trim()}")` : '';
			this.view.message =
				shown === 0
					? `No web resources match the current filters${search}.`
					: `Filtered: showing ${shown} of ${this.resources.length}${search}.`;
		} else {
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
				(filters.link === 'all' || (filters.link === 'linked') === (n.link !== undefined)) &&
				matchesSearch(n, filters.search)
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

	/** Whether the node is shown with the current filters (Go to Web Resource needs to know). */
	isVisible(node: WebResourceNode): boolean {
		return this.visibleNodes().some((n) => n.resource.webresourceid === node.resource.webresourceid);
	}

	/** Selects and focuses the node in the tree (Go to Web Resource). */
	async revealNode(node: WebResourceNode): Promise<void> {
		const current = this.nodes.get(node.resource.webresourceid);
		if (current) {await this.view.reveal(current, { select: true, focus: true });}
	}

	/** The list is flat, so nothing has a parent - but reveal() requires this to be implemented. */
	getParent(): undefined {
		return undefined;
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
		// Click: compare a modified resource; open the local file of an in-sync linked one; show
		// the Dataverse content of anything else (managed, or not linked). All open as a preview
		// without taking focus, so the tree keeps focus (like Explorer).
		const click: ItemClickOptions = { preserveFocus: true };
		if (canSync(node)) {
			item.command = { command: 'wrsync.compare', title: 'Compare', arguments: [node, click] };
		} else if (link && !node.mismatched && !resource.ismanaged) {
			item.command = { command: 'wrsync.openLocalFile', title: 'Open Local File', arguments: [node, click] };
		} else if (isSvgType(resource.webresourcetype)) {
			// The rendered graphic is more useful at a glance than its XML (still on right-click).
			item.command = { command: 'wrsync.previewImage', title: 'Preview Image', arguments: [node, click] };
		} else {
			// Text opens read-only, images in the image preview; a XAP explains it can't be shown.
			item.command = { command: 'wrsync.viewContent', title: 'View Content', arguments: [node, click] };
		}
		item.tooltip = this.tooltip(node);
		return item;
	}

	/** Adds "last modified by" to the hover only when it's shown - one request per hovered item
	 * rather than one per item in the list. */
	async resolveTreeItem(item: vscode.TreeItem, node: WebResourceNode): Promise<vscode.TreeItem> {
		const environment = getEnvironment();
		if (!environment) {return item;}
		const { webresourceid, webresourcetype } = node.resource;
		const mime = imageMimeType(webresourcetype);
		// Details and (for images/SVG) the thumbnail are fetched together, only for the hovered
		// item. A failed thumbnail just leaves it out.
		const [details, thumbnail] = await Promise.all([
			getWebResourceDetails(environment.apiUrl, webresourceid).catch(() => undefined),
			mime
				? getWebResourceContent(environment.apiUrl, webresourceid)
						.then((base64): Thumbnail => (base64.length <= MAX_THUMBNAIL_BASE64 ? { mime, base64 } : 'tooLarge'))
						.catch(() => undefined)
				: Promise.resolve(undefined),
		]);
		const lastModified = details
			? `Last modified in Dataverse by ${details.modifiedbyname ?? 'unknown'}, ${details.modifiedon ? new Date(details.modifiedon).toLocaleString() : 'unknown time'}`
			: undefined;
		item.tooltip = this.tooltip(node, lastModified, thumbnail);
		return item;
	}

	private tooltip(node: WebResourceNode, extraLine?: string, thumbnail?: Thumbnail): vscode.MarkdownString {
		const { resource, link } = node;
		// What clicking an unlinked/managed item does - SVG previews the image, text shows source.
		const clickHint = isSvgType(resource.webresourcetype) ? 'Click to preview it.' : 'Click to view its content.';
		const md = new vscode.MarkdownString(undefined, true);
		md.appendMarkdown(`**${escapeMd(resource.name)}**\n\n`);
		if (thumbnail === 'tooLarge') {
			md.appendMarkdown('$(file-media) Too large for a thumbnail - click to preview.\n\n');
		} else if (thumbnail) {
			// A data URI, so no file is needed; "|height=" is VS Code's markdown image sizing.
			md.appendMarkdown(`![${escapeMd(resource.name)}](data:${thumbnail.mime};base64,${thumbnail.base64}|height=${THUMBNAIL_HEIGHT})\n\n`);
		}
		md.appendMarkdown(`${escapeMd(resource.displayname)} · ${typeLabel(resource.webresourcetype)} · ${resource.ismanaged ? 'Managed' : 'Unmanaged'}\n\n`);
		if (resource.ismanaged) {
			md.appendMarkdown(`$(lock) Managed: read-only here. ${clickHint}\n\n`);
			if (link) {
				md.appendMarkdown(`$(link) Still linked to \`${escapeMd(link.localPath)}\` - unlink it to tidy up.\n\n`);
			}
		} else if (link) {
			md.appendMarkdown(`$(link) \`${escapeMd(link.localPath)}\`\n\n`);
			if (node.mismatched) {
				md.appendMarkdown(`$(error) This file type can't be published to a ${typeLabel(resource.webresourcetype)} web resource. Unlink it and link a matching file.\n\n`);
			} else if (node.modified) {
				md.appendMarkdown('$(diff-modified) Modified: the local file differs from Dataverse. Click to compare.\n\n');
			} else {
				md.appendMarkdown('$(check) In sync with Dataverse.\n\n');
			}
		} else {
			md.appendMarkdown(
				node.linkable
					? `Not linked to a local file. ${clickHint}\n\n`
					: `${typeLabel(resource.webresourcetype)}: linking not supported.${node.viewable ? ' Click to preview.' : ''}\n\n`
			);
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

/** The Search filter: name, display name or linked file path (VS Code's built-in tree find only
 * sees the name). */
function matchesSearch(node: WebResourceNode, search: string): boolean {
	if (!search.trim()) {return true;}
	return [node.resource.name, node.resource.displayname, node.link?.localPath ?? ''].some((value) =>
		matchesText(value, search)
	);
}

function escapeMd(text: string): string {
	return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}
