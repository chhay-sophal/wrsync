/** Normalizes text before comparing local and Dataverse content, so differences that don't
 * change the file's meaning don't count: CRLF vs LF line endings (a Windows checkout with
 * core.autocrlf vs content saved from the maker portal or another OS) and a leading UTF-8 BOM.
 * Shared by change detection (modifiedTracker.ts) and link suggestions
 * (linkSuggestionContent.ts), so "identical" means the same everywhere. */
export function normalizeForCompare(text: string): string {
	const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	return withoutBom.replace(/\r\n?/g, '\n');
}
