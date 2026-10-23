import * as vscode from 'vscode';
import { getAuthStatus, login, logout } from './auth';
import { openCompareDiff, openRemoteContent } from './compareProvider';
import { createWebResource, getWebResourceDetails, listEnvironments, listSolutions } from './dataverseClient';
import { openLinkSuggestionsPanel } from './linkSuggestionsPanel';
import { openRemoteMedia } from './mediaProvider';
import { createLink, listLinks } from './linksStore';
import { forgetAll, recheckAll, recheckEnvironment } from './modifiedTracker';
import {
	clearSelection,
	EMPTY_FILTERS,
	getEnvironment,
	getFilters,
	getSolution,
	getSort,
	setEnvironment,
	setFilters,
	setSolution,
	setSort,
	type LinkFilter,
	type ManagedFilter,
	type SortColumn,
} from './state';
import { confirmAndPublish, confirmAndPull, confirmAndUnlink } from './syncActions';
import { CREATABLE_TYPES, isImageType, isLinkableFile, isSvgType, linkableExtensions, typeLabel } from './webResourceTypes';
import { canSync, type WebResourceNode, type WebResourceTree } from './webResourceTree';
import { listWorkspaceFiles } from './workspaceFiles';

async function updateSignedInContext(): Promise<void> {
	const { signedIn } = await getAuthStatus();
	await vscode.commands.executeCommand('setContext', 'wrsync.signedIn', signedIn);
}

/** Runs a command body, reporting failures instead of letting them vanish. */
function guarded<A extends unknown[]>(title: string, body: (...args: A) => Promise<unknown>) {
	return async (...args: A) => {
		try {
			await body(...args);
		} catch (err) {
			vscode.window.showErrorMessage(`${title} failed: ${(err as Error).message}`);
		}
	};
}

/** Item commands get (clicked node, all selected nodes) from a tree menu, or nothing from the
 * Command Palette/keybinding - fall back to the tree's selection then. */
function targets(tree: WebResourceTree, node?: WebResourceNode, selected?: WebResourceNode[]): WebResourceNode[] {
	if (selected && selected.length > 0) {return tree.current(selected);}
	if (node) {return tree.current([node]);}
	return tree.currentSelection();
}

/** The single item a command acts on: the clicked one, else the first selected - current
 * version either way (menus can hand over node objects with stale state). */
function one(tree: WebResourceTree, node?: WebResourceNode): WebResourceNode | undefined {
	return targets(tree, node)[0];
}

/** Options a tree item's click passes to Compare / Open Local File, so the editor opens
 * without taking focus from the tree (like single-clicking a file in Explorer). */
export interface ItemClickOptions {
	preserveFocus: true;
}

/** Context menus call item commands with (node, selectedNodes) - only the click passes the
 * options object, so explicit menu actions still focus the editor. */
function preservesFocus(options: unknown): boolean {
	return !Array.isArray(options) && (options as ItemClickOptions | undefined)?.preserveFocus === true;
}

function requireEnvironment() {
	const environment = getEnvironment();
	if (!environment) {throw new Error('Pick an environment first.');}
	return environment;
}

async function pickEnvironment(): Promise<boolean> {
	const environments = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Window, title: 'Loading environments...' },
		() => listEnvironments()
	);
	if (environments.length === 0) {
		vscode.window.showInformationMessage('No Dataverse environments found for this account.');
		return false;
	}
	const current = getEnvironment();
	const picked = await vscode.window.showQuickPick(
		environments
			.sort((a, b) => a.displayName.localeCompare(b.displayName))
			.map((env) => ({
				label: env.displayName,
				description: new URL(env.apiUrl).hostname,
				detail: env.id === current?.id ? 'Current' : undefined,
				env,
			})),
		{ title: 'Pick a Dataverse environment', matchOnDescription: true }
	);
	if (!picked) {return false;}
	await setEnvironment(picked.env);
	return true;
}

async function pickSolution(): Promise<boolean> {
	const environment = getEnvironment() ?? (await pickEnvironment() ? getEnvironment() : undefined);
	if (!environment) {return false;}
	const solutions = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Window, title: 'Loading solutions...' },
		() => listSolutions(environment.apiUrl)
	);
	if (solutions.length === 0) {
		vscode.window.showInformationMessage(`No unmanaged solutions found in ${environment.displayName}.`);
		return false;
	}
	const current = getSolution();
	const picked = await vscode.window.showQuickPick(
		solutions
			.sort((a, b) => a.friendlyname.localeCompare(b.friendlyname))
			.map((sol) => ({
				label: sol.friendlyname,
				description: sol.uniquename,
				detail: sol.solutionid === current?.solutionid ? 'Current' : undefined,
				sol,
			})),
		{ title: `Pick a solution in ${environment.displayName}`, matchOnDescription: true }
	);
	if (!picked) {return false;}
	await setSolution(picked.sol);
	return true;
}

export function registerWebResourceCommands(context: vscode.ExtensionContext, tree: WebResourceTree): void {
	updateSignedInContext();
	const register = (id: string, handler: (...args: never[]) => unknown) =>
		context.subscriptions.push(vscode.commands.registerCommand(id, handler));

	register(
		'wrsync.signIn',
		guarded('Sign-in', async () => {
			const { username } = await login();
			await updateSignedInContext();
			vscode.window.showInformationMessage(`Signed in as ${username}`);
			if (!getEnvironment()) {await pickEnvironment();}
			tree.reload();
			recheckAll();
		})
	);
	register(
		'wrsync.signInToTenant',
		guarded('Sign-in', async () => {
			const tenant = await vscode.window.showInputBox({
				title: 'Sign in to another tenant',
				prompt:
					"Only needed when your Dataverse environment is in a different organization than your account's home tenant.",
				placeHolder: 'contoso.onmicrosoft.com or a tenant ID',
				ignoreFocusOut: true,
			});
			if (!tenant?.trim()) {return;}
			const { username } = await login(tenant.trim());
			await updateSignedInContext();
			vscode.window.showInformationMessage(`Signed in as ${username}`);
			if (!getEnvironment()) {await pickEnvironment();}
			tree.reload();
			recheckAll();
		})
	);
	register(
		'wrsync.signOut',
		guarded('Sign-out', async () => {
			await logout();
			await clearSelection();
			await updateSignedInContext();
			forgetAll();
			vscode.window.showInformationMessage('Signed out.');
		})
	);
	register(
		'wrsync.showAuthStatus',
		guarded('Show sign-in status', async () => {
			const status = await getAuthStatus();
			vscode.window.showInformationMessage(status.signedIn ? `Signed in as ${status.username}` : 'Not signed in');
		})
	);

	register('wrsync.pickEnvironment', guarded('Pick environment', async () => (await pickEnvironment()) && pickSolution()));
	register('wrsync.pickSolution', guarded('Pick solution', pickSolution));
	register(
		'wrsync.refresh',
		guarded('Refresh', async () => {
			const environment = getEnvironment();
			await Promise.all([tree.reload(), environment ? recheckEnvironment(environment.id) : undefined]);
		})
	);

	register(
		'wrsync.createWebResource',
		guarded('Create web resource', async () => {
			const environment = requireEnvironment();
			const solution = getSolution();
			if (!solution) {throw new Error('Pick a solution first.');}
			const name = await vscode.window.showInputBox({
				title: 'Create web resource (1/3): name',
				prompt: 'Include the publisher prefix, e.g. new_/scripts/myscript.js',
				ignoreFocusOut: true,
				validateInput: (value) => (value.trim() ? undefined : 'A name is required.'),
			});
			if (!name) {return;}
			const displayname = await vscode.window.showInputBox({
				title: 'Create web resource (2/3): display name',
				value: name.trim().split('/').pop(),
				ignoreFocusOut: true,
				validateInput: (value) => (value.trim() ? undefined : 'A display name is required.'),
			});
			if (!displayname) {return;}
			const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
			const picked = await vscode.window.showQuickPick(
				CREATABLE_TYPES.map((t) => ({ label: t.label, type: t.type, picked: linkableExtensions(t.type)?.includes(extension) })).sort(
					(a, b) => Number(b.picked) - Number(a.picked)
				),
				{ title: 'Create web resource (3/3): type', ignoreFocusOut: true }
			);
			if (!picked) {return;}
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Creating ${name.trim()}...` },
				() =>
					createWebResource(environment.apiUrl, solution.uniquename, {
						name: name.trim(),
						displayname: displayname.trim(),
						webresourcetype: picked.type,
						content: '',
					})
			);
			await tree.reload();
		})
	);

	register(
		'wrsync.suggestLinks',
		guarded('Suggest links', async () => {
			const environment = requireEnvironment();
			const solution = getSolution();
			if (!solution) {throw new Error('Pick a solution first.');}
			const { files } = await listWorkspaceFiles();
			const linkedPaths = new Set(listLinks().map((l) => l.localPath));
			openLinkSuggestionsPanel({
				orgApiUrl: environment.apiUrl,
				environmentId: environment.id,
				solutionUniqueName: solution.uniquename,
				solutionName: solution.friendlyname,
				resources: tree
					.allNodes()
					.filter((n) => !n.link && n.linkable)
					.map(({ resource: r }) => ({ webresourceid: r.webresourceid, name: r.name, webresourcetype: r.webresourcetype })),
				filePaths: files.map((f) => f.path).filter((p) => !linkedPaths.has(p)),
			});
		})
	);

	// --- Filters and sort ---

	register(
		'wrsync.filterTypes',
		guarded('Filter by type', async () => {
			const filters = getFilters();
			const picked = await vscode.window.showQuickPick(
				tree.presentTypes().map((type) => ({ label: typeLabel(type), type, picked: filters.types.includes(type) })),
				{ title: 'Show web resources of type (none picked: all)', canPickMany: true }
			);
			if (picked) {await setFilters({ ...filters, types: picked.map((p) => p.type) });}
		})
	);
	register(
		'wrsync.filterManaged',
		guarded('Filter by managed state', async () => {
			const filters = getFilters();
			const options: { label: string; value: ManagedFilter }[] = [
				{ label: 'All', value: 'all' },
				{ label: 'Managed only', value: 'managed' },
				{ label: 'Unmanaged only', value: 'unmanaged' },
			];
			const picked = await vscode.window.showQuickPick(
				options.map((o) => ({ ...o, description: o.value === filters.managed ? 'Current' : undefined })),
				{ title: 'Show managed / unmanaged web resources' }
			);
			if (picked) {await setFilters({ ...filters, managed: picked.value });}
		})
	);
	// Two commands per toggle so the Filter menu can show a check mark on the "on" one.
	// Modified resources are always linked, so "modified only" and "unlinked only" switch each
	// other off rather than combine into an always-empty list.
	const toggleModifiedOnly = guarded('Show modified only', async () => {
		const filters = getFilters();
		const modifiedOnly = !filters.modifiedOnly;
		await setFilters({ ...filters, modifiedOnly, link: modifiedOnly && filters.link === 'unlinked' ? 'all' : filters.link });
	});
	register('wrsync.showModifiedOnly', toggleModifiedOnly);
	register('wrsync.showAllNotOnlyModified', toggleModifiedOnly);
	/** Turns a link filter on (switching the other one off), or back off. */
	const toggleLink = (value: Exclude<LinkFilter, 'all'>) =>
		guarded(`Show ${value} only`, async () => {
			const filters = getFilters();
			const link = filters.link === value ? 'all' : value;
			await setFilters({ ...filters, link, modifiedOnly: link === 'unlinked' ? false : filters.modifiedOnly });
		});
	register('wrsync.showLinkedOnly', toggleLink('linked'));
	register('wrsync.showAllNotOnlyLinked', toggleLink('linked'));
	register('wrsync.showUnlinkedOnly', toggleLink('unlinked'));
	register('wrsync.showAllNotOnlyUnlinked', toggleLink('unlinked'));
	register('wrsync.clearFilters', guarded('Clear filters', () => setFilters(EMPTY_FILTERS)));
	register(
		'wrsync.sortBy',
		guarded('Sort', async () => {
			const current = getSort() ?? { column: 'name' as SortColumn, direction: 'asc' as const };
			const columns: { label: string; column: SortColumn }[] = [
				{ label: 'Name', column: 'name' },
				{ label: 'Display name', column: 'displayname' },
				{ label: 'Type', column: 'type' },
				{ label: 'Managed state', column: 'managed' },
			];
			const picked = await vscode.window.showQuickPick(
				columns.flatMap((c) =>
					(['asc', 'desc'] as const).map((direction) => ({
						label: `${c.label} ${direction === 'asc' ? '(A→Z)' : '(Z→A)'}`,
						description: c.column === current.column && direction === current.direction ? 'Current' : undefined,
						sort: { column: c.column, direction },
					}))
				),
				{ title: 'Sort web resources by' }
			);
			if (picked) {await setSort(picked.sort);}
		})
	);

	// --- Item actions (inline buttons, context menu, click) ---

	register(
		'wrsync.link',
		guarded('Link', async (node?: WebResourceNode) => {
			const target = one(tree, node);
			if (!target) {return;}
			const environment = requireEnvironment();
			const solution = getSolution();
			if (!target.linkable) {
				vscode.window.showInformationMessage(
					target.resource.ismanaged
						? `${target.resource.name} is managed and read-only here - use View Content to see it.`
						: `${typeLabel(target.resource.webresourcetype)} web resources can't be linked.`
				);
				return;
			}
			const extensions = linkableExtensions(target.resource.webresourcetype);
			if (!extensions || !solution) {return;}
			const { files } = await listWorkspaceFiles();
			const matching = files.filter((f) => isLinkableFile(target.resource.webresourcetype, f.path));
			const list = extensions.map((e) => `.${e}`).join(' / ');
			if (matching.length === 0) {
				vscode.window.showInformationMessage(`No ${list} files found in the workspace.`);
				return;
			}
			const linkedPaths = new Map(listLinks().map((l) => [l.localPath, l.webresourceName]));
			const picked = await vscode.window.showQuickPick(
				matching.map((f) => ({
					label: f.path.split('/').pop() ?? f.path,
					description: f.path,
					detail: linkedPaths.has(f.path) ? `Already linked to ${linkedPaths.get(f.path)}` : undefined,
					path: f.path,
				})),
				{ title: `Link ${target.resource.name} to a ${list} file`, matchOnDescription: true }
			);
			if (!picked) {return;}
			await createLink({
				environmentId: environment.id,
				solutionUniqueName: solution.uniquename,
				webresourceId: target.resource.webresourceid,
				webresourceName: target.resource.name,
				localPath: picked.path,
			});
		})
	);
	register(
		'wrsync.unlink',
		guarded('Unlink', async (node?: WebResourceNode) => {
			const link = one(tree, node)?.link;
			if (link) {await confirmAndUnlink(link);}
		})
	);
	/** Publishes the publishable ones (linked, modified, matching type) and says how many of
	 * the rest were skipped. */
	const publish = async (all: WebResourceNode[]) => {
		const environment = requireEnvironment();
		const publishable = all.filter(canSync);
		const skipped = all.length - publishable.length;
		if (publishable.length === 0) {
			vscode.window.showInformationMessage('Nothing to publish: the selected web resources are not linked, in sync, or linked to a mismatched file.');
			return;
		}
		if (skipped > 0) {
			vscode.window.showInformationMessage(`Skipping ${skipped} selected web resource(s) that are not linked, in sync, or mismatched.`);
		}
		await confirmAndPublish(
			environment.apiUrl,
			publishable.map((n) => ({ webresourceId: n.resource.webresourceid, name: n.resource.name, localPath: n.link!.localPath }))
		);
	};
	// From an item's inline button or context menu (VS Code passes the whole selection when
	// the clicked item is part of it), or the Command Palette.
	register(
		'wrsync.publish',
		guarded('Publish', (node?: WebResourceNode, selected?: WebResourceNode[]) => publish(targets(tree, node, selected)))
	);
	// Title bar / context menu "Publish Selected": always the current selection.
	register('wrsync.publishSelected', guarded('Publish', () => publish(tree.currentSelection())));
	register(
		'wrsync.pull',
		guarded('Pull', async (node?: WebResourceNode) => {
			const target = one(tree, node);
			if (!target?.link || !canSync(target)) {return;}
			await confirmAndPull(requireEnvironment().apiUrl, {
				webresourceId: target.resource.webresourceid,
				name: target.resource.name,
				localPath: target.link.localPath,
			});
		})
	);
	register(
		'wrsync.compare',
		guarded('Compare', async (node?: WebResourceNode, options?: unknown) => {
			const target = one(tree, node);
			if (!target?.link) {return;}
			await openCompareDiff({
				orgApiUrl: requireEnvironment().apiUrl,
				webresourceId: target.resource.webresourceid,
				webresourceName: target.resource.name,
				webresourcetype: target.resource.webresourcetype,
				localPath: target.link.localPath,
				preserveFocus: preservesFocus(options),
			});
		})
	);
	register(
		'wrsync.viewContent',
		guarded('View content', async (node?: WebResourceNode, options?: unknown) => {
			const target = one(tree, node);
			if (!target) {return;}
			if (!target.viewable) {
				vscode.window.showInformationMessage(
					`${target.resource.name} is a ${typeLabel(target.resource.webresourcetype)} package, which can't be previewed.`
				);
				return;
			}
			const params = {
				orgApiUrl: requireEnvironment().apiUrl,
				webresourceId: target.resource.webresourceid,
				webresourceName: target.resource.name,
				webresourcetype: target.resource.webresourcetype,
				preserveFocus: preservesFocus(options),
			};
			// Images go to VS Code's image preview; everything else viewable is text.
			if (isImageType(target.resource.webresourcetype)) {
				await openRemoteMedia(params);
			} else {
				await openRemoteContent(params);
			}
		})
	);
	register(
		'wrsync.previewImage',
		guarded('Preview image', async (node?: WebResourceNode, options?: unknown) => {
			const target = one(tree, node);
			const type = target?.resource.webresourcetype;
			if (!target || type === undefined || !(isSvgType(type) || isImageType(type))) {return;}
			// Always the Dataverse version - for a linked SVG, the local file is a click away.
			await openRemoteMedia({
				orgApiUrl: requireEnvironment().apiUrl,
				webresourceId: target.resource.webresourceid,
				webresourceName: target.resource.name,
				webresourcetype: type,
				preserveFocus: preservesFocus(options),
			});
		})
	);
	register(
		'wrsync.openLocalFile',
		guarded('Open local file', async (node?: WebResourceNode, options?: unknown) => {
			const target = one(tree, node);
			const folder = vscode.workspace.workspaceFolders?.[0];
			if (!target?.link || !folder) {return;}
			await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, target.link.localPath), {
				preview: true,
				preserveFocus: preservesFocus(options),
			});
		})
	);
	register(
		'wrsync.showDetails',
		guarded('Show details', async (node?: WebResourceNode) => {
			const target = one(tree, node);
			if (!target) {return;}
			const r = target.resource;
			const details = await getWebResourceDetails(requireEnvironment().apiUrl, r.webresourceid).catch(() => undefined);
			const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : '-');
			const lines = [
				`Display name: ${r.displayname}`,
				`Type: ${typeLabel(r.webresourcetype)}`,
				`Managed: ${r.ismanaged ? 'Yes' : 'No'}`,
				`Description: ${details?.description || '-'}`,
				`Created on: ${date(details?.createdon)}`,
				`Modified on: ${date(details?.modifiedon)}`,
				`Modified by: ${details?.modifiedbyname ?? '-'}`,
				`ID: ${r.webresourceid}`,
				`Linked file: ${target.link?.localPath ?? '-'}`,
			];
			const answer = await vscode.window.showInformationMessage(r.name, { modal: true, detail: lines.join('\n') }, 'Copy Name', 'Copy ID');
			if (answer === 'Copy Name') {await vscode.env.clipboard.writeText(r.name);}
			if (answer === 'Copy ID') {await vscode.env.clipboard.writeText(r.webresourceid);}
		})
	);
}
