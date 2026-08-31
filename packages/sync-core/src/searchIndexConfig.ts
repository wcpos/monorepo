/**
 * Local search-index tuning, shared by every side that has to agree on it:
 *
 *  - `@wcpos/database` configures the FlexSearch index with it (`minlength`)
 *  - `@wcpos/query` short-circuits a local search below it
 *  - `@wcpos/sync-engine` fetchers skip asking the server for a term the local
 *    index could not match anyway
 *
 * It lived as four separate literals held together by three "keep equal to"
 * comments. sync-core is the only package all four consumers depend on.
 */

/** Shortest term the local search index can match. */
export const FLEXSEARCH_MIN_TERM_LENGTH = 3;

export const FLEXSEARCH_TOKEN_BOUNDARY = /[\p{Z}\p{S}\p{P}\p{C}]+/u;

export function foldSearchText(value: unknown): string {
	return String(value)
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

/**
 * FlexSearch 0.7.43's default encoder does no Unicode normalization or accent folding,
 * so NFD and accentless queries miss NFC titles. A custom `encode` runs for indexing
 * and querying; `tokenize: 'full'` and `minlength` still apply per returned word
 * (verified against the vendored FlexSearch 0.7.43).
 */
export function encodeSearchText(value: unknown): string[] {
	return foldSearchText(value).split(FLEXSEARCH_TOKEN_BOUNDARY).filter(Boolean);
}
