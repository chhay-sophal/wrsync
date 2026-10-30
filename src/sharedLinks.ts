import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from 'jsonc-parser';

/** The file at the workspace root that describes how the repository maps to Dataverse. It's
 * shared with other tools (git-pa keeps its plug-in settings in it), so only the
 * "webResources" section belongs to this extension; everything else is left as it is. */
export const SHARED_FILE_NAME = 'dataverse.json';

/** A link as committed for the whole team: by web resource name, which (unlike the record's
 * ID) is the same in every environment. */
export interface SharedLink {
	name: string;
	file: string;
}

export interface SharedFile {
	/** The team's dev environment URL (https://org.crm.dynamics.com), if set. */
	environment: string | undefined;
	links: SharedLink[];
}

function parseObject(text: string): Record<string, unknown> {
	if (text.trim() === '') {return {};}
	const errors: ParseError[] = [];
	const root: unknown = parse(text, errors, { allowTrailingComma: true });
	if (errors.length > 0) {
		throw new Error(`${SHARED_FILE_NAME} is not valid JSON (${printParseErrorCode(errors[0].error)} at character ${errors[0].offset}).`);
	}
	if (typeof root !== 'object' || root === null || Array.isArray(root)) {
		throw new Error(`${SHARED_FILE_NAME} must contain a JSON object.`);
	}
	return root as Record<string, unknown>;
}

/** Reads dataverse.json's content; throws when it isn't valid JSON. Malformed link entries
 * are skipped rather than failing the whole file. */
export function parseSharedFile(text: string): SharedFile {
	const root = parseObject(text);
	const section = root.webResources as { links?: unknown } | undefined;
	const links = Array.isArray(section?.links) ? section.links : [];
	return {
		environment: typeof root.environment === 'string' ? root.environment.replace(/\/+$/, '') : undefined,
		links: links.filter(
			(l): l is SharedLink => typeof l?.name === 'string' && typeof l?.file === 'string' && l.name !== '' && l.file !== ''
		),
	};
}

function edit(text: string, path: string[], value: unknown): string {
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const result = applyEdits(text, modify(text, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol } }));
	return result.endsWith(eol) ? result : result + eol;
}

/** Returns dataverse.json's content with its links replaced (sorted by name, so diffs stay
 * small), keeping comments, formatting and every other section. */
export function withLinks(text: string, links: SharedLink[]): string {
	parseObject(text); // never rewrite a file that can't be read: other tools' settings would be lost
	const sorted = [...links]
		.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
		.map(({ name, file }) => ({ name, file }));
	return edit(text.trim() === '' ? '{}' : text, ['webResources', 'links'], sorted);
}

/** Returns dataverse.json's content with "environment" set, if it has none yet. */
export function withEnvironment(text: string, environmentUrl: string): string {
	if (parseSharedFile(text).environment) {return text;}
	return edit(text.trim() === '' ? '{}' : text, ['environment'], environmentUrl);
}

/** Replaces the links for the given names (case-insensitive, like Dataverse) with the given
 * files; a null file removes the link. */
export function upsertLinks(links: SharedLink[], changes: { name: string; file: string | null }[]): SharedLink[] {
	const changed = new Map(changes.map((c) => [c.name.toLowerCase(), c]));
	const kept = links.filter((l) => !changed.has(l.name.toLowerCase()));
	const added = [...changed.values()].filter((c): c is SharedLink => c.file !== null);
	return [...kept, ...added];
}
