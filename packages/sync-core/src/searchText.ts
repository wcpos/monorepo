/**
 * The search text rules every side has to agree on (#1732, #2411):
 *
 *  - `@wcpos/query` folds each record into its search row and splits the typed query
 *    into terms with these
 *  - the logs scan selector (`scanSearchSelector.ts`) folds its regex operand with them
 *  - the plugin's SQL ports the same fold (PHPUnit, by hand); `searchFixtureCatalogue.ts`
 *    is the shared oracle that fails first, by name, when either side drifts
 *
 * The contract: every whitespace-split term is a literal substring of the folded row, in
 * any order, across fields; wrapping punctuation is stripped; no minimum and no maximum
 * term length. The server searches `LIKE '%term%'` per whitespace-split term with
 * punctuation literal, and wp-admin does the same.
 */

/**
 * Where a search string breaks into terms: whitespace/control characters only.
 * Internal quotes, commas, plus signs and dots stay literal, so "0,4", "0.4", "3/4" and
 * "K-2" are each one term, as they are to the server's LIKE.
 */
export const SEARCH_TOKEN_BOUNDARY = /[\p{Z}\p{C}]+/u;

/** Punctuation wrapping a term — `'0.4'`, `(shirt)`, `shirt!` — is not part of it. */
const WRAPPING_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

/** Lowercase, NFD, combining marks removed: "Crème" and "creme" fold to the same text. */
export function foldSearchText(value: unknown): string {
	return String(value)
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

/** The typed query as folded terms, each of which must be a substring of a matching row. */
export function searchTerms(search: string): string[] {
	return foldSearchText(search)
		.split(SEARCH_TOKEN_BOUNDARY)
		.map((term) => term.replace(WRAPPING_PUNCTUATION, ''))
		.filter(Boolean);
}

/**
 * Shortest term the logs SCAN runs for. The blob has no minimum — a one-character term is
 * a cheap `indexOf` — but the logs scan is a storage-side `$regex` over every row of the
 * one collection that churns (46k rows a day, 2026-09-15), so a one- or two-character term
 * that would match nearly every row is dropped before it reaches storage.
 */
export const SCAN_MIN_TERM_LENGTH = 3;
