import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { getWebResourceContents } from './dataverseClient';
import { normalizeForCompare } from './textCompare';
import { isLinkableFile } from './webResourceTypes';

/** Larger local files are skipped: web resources are scripts, styles and markup, and reading
 * huge build artefacts would only slow the comparison down. */
const MAX_FILE_BYTES = 1_000_000;
/** Content this short (after trimming) - empty files, one-line stubs - is too common to
 * identify anything, so it's left to name matching. */
const MIN_CONTENT_CHARS = 20;
const FILE_READ_CONCURRENCY = 32;

export interface ContentMatches {
	/** webresourceid -> local files of a matching type whose content is identical to it. */
	identical: Record<string, string[]>;
	/** Resources whose content another resource in the list shares exactly - content alone
	 * can't tell them apart. */
	shared: string[];
}

/** A fingerprint of the normalized content, or undefined for content too short to identify
 * anything. Hashing makes matching one pass over each list instead of comparing every pair. */
function fingerprint(text: string): string | undefined {
	const normalized = normalizeForCompare(text);
	if (normalized.trim().length < MIN_CONTENT_CHARS) {return undefined;}
	return createHash('sha256').update(normalized).digest('hex');
}

/**
 * For "Suggest Links": finds local files whose content is identical to unlinked web resources,
 * whatever their names - so a renamed or moved copy is found with certainty. Downloads the
 * resources' content in batches, reads only local files whose type some resource can link to,
 * and matches by fingerprint. Name matching (in the page) covers edited copies, which this
 * can't find.
 */
export async function findIdenticalContent(params: {
	orgApiUrl: string;
	resources: { webresourceid: string; webresourcetype: number }[];
	filePaths: string[];
}): Promise<ContentMatches> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder || params.resources.length === 0) {return { identical: {}, shared: [] };}

	const contents = await getWebResourceContents(params.orgApiUrl, params.resources.map((r) => r.webresourceid));
	const resourcesByHash = new Map<string, { webresourceid: string; webresourcetype: number }[]>();
	for (const resource of params.resources) {
		const base64 = contents.get(resource.webresourceid.toLowerCase());
		const hash = base64 === undefined ? undefined : fingerprint(Buffer.from(base64, 'base64').toString('utf-8'));
		if (hash) {resourcesByHash.set(hash, [...(resourcesByHash.get(hash) ?? []), resource]);}
	}

	const types = [...new Set(params.resources.map((r) => r.webresourcetype))];
	const candidates = params.filePaths.filter((path) => types.some((type) => isLinkableFile(type, path)));
	const filesByHash = new Map<string, string[]>();
	for (let i = 0; i < candidates.length; i += FILE_READ_CONCURRENCY) {
		await Promise.all(
			candidates.slice(i, i + FILE_READ_CONCURRENCY).map(async (path) => {
				try {
					const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, path));
					if (bytes.byteLength > MAX_FILE_BYTES) {return;}
					const hash = fingerprint(Buffer.from(bytes).toString('utf-8'));
					if (hash && resourcesByHash.has(hash)) {filesByHash.set(hash, [...(filesByHash.get(hash) ?? []), path]);}
				} catch {
					// Unreadable file - just not a content match.
				}
			})
		);
	}

	const identical: Record<string, string[]> = {};
	const shared: string[] = [];
	for (const [hash, resources] of resourcesByHash) {
		const files = filesByHash.get(hash) ?? [];
		for (const resource of resources) {
			const matching = files.filter((path) => isLinkableFile(resource.webresourcetype, path)).sort();
			if (matching.length > 0) {identical[resource.webresourceid] = matching;}
			if (resources.length > 1) {shared.push(resource.webresourceid);}
		}
	}
	return { identical, shared };
}
