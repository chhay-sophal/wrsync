import * as vscode from 'vscode';
import type { DataverseEnvironment, Solution } from './dataverseClient';

export type ManagedFilter = 'all' | 'managed' | 'unmanaged';
/** Linked to a local file or not - one setting, since "linked only" and "unlinked only" are
 * mutually exclusive. */
export type LinkFilter = 'all' | 'linked' | 'unlinked';
export type SortColumn = 'name' | 'displayname' | 'type' | 'managed';

export interface Filters {
	/** Web resource type codes to show; empty shows all. */
	types: number[];
	managed: ManagedFilter;
	/** Only resources whose linked local file differs from Dataverse. */
	modifiedOnly: boolean;
	link: LinkFilter;
}

export interface SortState {
	column: SortColumn;
	direction: 'asc' | 'desc';
}

export const EMPTY_FILTERS: Filters = { types: [], managed: 'all', modifiedOnly: false, link: 'all' };

const KEY_ENVIRONMENT = 'wrsync.environment';
const KEY_SOLUTION = 'wrsync.solution';
const KEY_VIEW_PREFIX = 'wrsync.view.';

let memento: vscode.Memento;
const stateChanged = new vscode.EventEmitter<void>();
/** Fires when the selected environment/solution, the filters or the sort change. */
export const onDidChangeState = stateChanged.event;

/** The tree's working context - which environment and solution it shows, and how it's filtered
 * and sorted - persisted per workspace (an opened folder usually maps to one solution). Filters
 * and sort are kept per environment+solution, so switching solutions doesn't carry them over but
 * coming back restores them. Must be called once from activate(). */
export function initState(context: vscode.ExtensionContext): void {
	memento = context.workspaceState;
	updateContextKeys();
}

export function getEnvironment(): DataverseEnvironment | undefined {
	return memento.get<DataverseEnvironment>(KEY_ENVIRONMENT);
}

export function getSolution(): Solution | undefined {
	return memento.get<Solution>(KEY_SOLUTION);
}

/** Switching environment always clears the solution - solutions belong to one environment. */
export async function setEnvironment(environment: DataverseEnvironment | undefined): Promise<void> {
	await memento.update(KEY_ENVIRONMENT, environment);
	await memento.update(KEY_SOLUTION, undefined);
	changed();
}

export async function setSolution(solution: Solution | undefined): Promise<void> {
	await memento.update(KEY_SOLUTION, solution);
	changed();
}

function viewKey(): string | undefined {
	const environment = getEnvironment();
	const solution = getSolution();
	return environment && solution ? `${KEY_VIEW_PREFIX}${environment.id}::${solution.solutionid}` : undefined;
}

export function getFilters(): Filters {
	const key = viewKey();
	const stored = key ? memento.get<{ filters?: Partial<Filters> & { linkedOnly?: boolean } }>(key)?.filters : undefined;
	const { linkedOnly, ...filters } = stored ?? {};
	// Filters saved before "linked only" became the `link` setting keep their meaning.
	return { ...EMPTY_FILTERS, ...(linkedOnly ? { link: 'linked' as const } : {}), ...filters };
}

export function getSort(): SortState | undefined {
	const key = viewKey();
	return key ? memento.get<{ sort?: SortState }>(key)?.sort : undefined;
}

export async function setFilters(filters: Filters): Promise<void> {
	const key = viewKey();
	if (!key) {return;}
	await memento.update(key, { ...memento.get<object>(key), filters });
	changed();
}

export async function setSort(sort: SortState | undefined): Promise<void> {
	const key = viewKey();
	if (!key) {return;}
	await memento.update(key, { ...memento.get<object>(key), sort });
	changed();
}

export function filtersActive(filters = getFilters()): boolean {
	return filters.types.length > 0 || filters.managed !== 'all' || filters.modifiedOnly || filters.link !== 'all';
}

/** On sign-out: forget the environment and solution (they belong to the signed-in account). */
export async function clearSelection(): Promise<void> {
	await memento.update(KEY_ENVIRONMENT, undefined);
	await memento.update(KEY_SOLUTION, undefined);
	changed();
}

function changed(): void {
	updateContextKeys();
	stateChanged.fire();
}

/** Context keys used by package.json `when` clauses (welcome content, menus). */
function updateContextKeys(): void {
	const filters = getFilters();
	vscode.commands.executeCommand('setContext', 'wrsync.hasEnvironment', getEnvironment() !== undefined);
	vscode.commands.executeCommand('setContext', 'wrsync.hasSolution', getSolution() !== undefined);
	vscode.commands.executeCommand('setContext', 'wrsync.filtersActive', filtersActive(filters));
	vscode.commands.executeCommand('setContext', 'wrsync.modifiedOnly', filters.modifiedOnly);
	vscode.commands.executeCommand('setContext', 'wrsync.linkFilter', filters.link);
}
