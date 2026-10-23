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

/** The usual file extension for each type - what an icon theme needs to pick the right icon
 * for a resource whose name has no (or a different) extension, e.g. "sync_Lookup". */
const ICON_EXTENSIONS: Record<number, string[]> = {
	...LINKABLE_EXTENSIONS,
	5: ['png'],
	6: ['jpg', 'jpeg'],
	7: ['gif'],
	8: ['xap'],
	10: ['ico'],
};

/** The name with its type's usual extension appended when it doesn't already end in one that
 * matches - "sync_Lookup" (JavaScript) becomes "sync_Lookup.js", "new_/a.js" stays as is. Only
 * for choosing an icon; never shown or sent anywhere. */
export function nameWithTypeExtension(name: string, webresourcetype: number): string {
	const extensions = ICON_EXTENSIONS[webresourcetype];
	if (!extensions) {return name;}
	const lastSegment = name.slice(name.lastIndexOf('/') + 1);
	const dot = lastSegment.lastIndexOf('.');
	const extension = dot === -1 ? '' : lastSegment.slice(dot + 1).toLowerCase();
	return extensions.includes(extension) ? name : `${name}.${extensions[0]}`;
}

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

/** Whether the type's content is text, so it can be shown in an editor (View Content). */
export function isTextType(webresourcetype: number): boolean {
	return LINKABLE_EXTENSIONS[webresourcetype] !== undefined;
}

/** Image types, which open in VS Code's image preview (View Content). XAP, the other binary
 * type, is a zip package with nothing to preview. */
export function isImageType(webresourcetype: number): boolean {
	return [5, 6, 7, 10].includes(webresourcetype);
}

/** SVG: text (linked, diffed and published like any text type) that also renders as an
 * image - so it gets Preview Image on top of View Content. */
export function isSvgType(webresourcetype: number): boolean {
	return webresourcetype === 11;
}

const IMAGE_MIME_TYPES: Record<number, string> = {
	5: 'image/png',
	6: 'image/jpeg',
	7: 'image/gif',
	10: 'image/x-icon',
	11: 'image/svg+xml',
};

/** MIME type for types that can be shown as an image (hover thumbnails), else undefined. */
export function imageMimeType(webresourcetype: number): string | undefined {
	return IMAGE_MIME_TYPES[webresourcetype];
}

/** Whether a local file's extension matches the type - false for binary types, and for links
 * made before linking was restricted by type. */
export function isLinkableFile(webresourcetype: number, localPath: string): boolean {
	const extension = localPath.slice(localPath.lastIndexOf('.') + 1).toLowerCase();
	return linkableExtensions(webresourcetype)?.includes(extension) ?? false;
}
