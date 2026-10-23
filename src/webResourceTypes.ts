/** Dataverse web resource type codes (webresourcetype) and what this extension can do with
 * each. Keep LINKABLE_EXTENSIONS in sync with webview-ui/src/features/webresources/
 * webResourceTypes.ts (used by the Suggested links page) and with INCLUDE_GLOB in
 * workspaceFiles.ts, or matching files won't be offered. */

export const TYPE_LABELS: Record<number, string> = {
	1: 'HTML',
	2: 'CSS',
	3: 'JavaScript',
	4: 'XML',
	5: 'PNG',
	6: 'JPG',
	7: 'GIF',
	8: 'XAP',
	9: 'XSL',
	10: 'ICO',
	11: 'SVG',
	12: 'RESX',
};

/** Local file extensions each text type can be linked to. Binary types (PNG, JPG, GIF, ICO,
 * XAP) are absent: content is read and uploaded as UTF-8 text, which would corrupt them. */
const LINKABLE_EXTENSIONS: Record<number, string[]> = {
	1: ['html', 'htm'],
	2: ['css'],
	3: ['js'],
	4: ['xml'],
	9: ['xsl', 'xslt'],
	11: ['svg'],
	12: ['resx'],
};

/** Types offered by "Create Web Resource" (new, empty content). */
export const CREATABLE_TYPES: { type: number; label: string }[] = [
	{ type: 3, label: 'JavaScript' },
	{ type: 1, label: 'HTML' },
	{ type: 2, label: 'CSS' },
];

export function typeLabel(webresourcetype: number): string {
	return TYPE_LABELS[webresourcetype] ?? `Type ${webresourcetype}`;
}

/** Extensions a local file may have to be linked to this type, or null if it can't be linked. */
export function linkableExtensions(webresourcetype: number): string[] | null {
	return LINKABLE_EXTENSIONS[webresourcetype] ?? null;
}

/** Whether a local file's extension matches the type - false for binary types, and for links
 * made before linking was restricted by type. */
export function isLinkableFile(webresourcetype: number, localPath: string): boolean {
	const extension = localPath.slice(localPath.lastIndexOf('.') + 1).toLowerCase();
	return linkableExtensions(webresourcetype)?.includes(extension) ?? false;
}
