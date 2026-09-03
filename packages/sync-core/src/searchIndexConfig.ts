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

/**
 * Where a search string breaks into terms: whitespace/control characters and the
 * three characters WordPress's own `WP_Query::parse_search()` treats as term
 * separators (`"`, `,`, `+`).
 *
 * Punctuation inside a term is part of the term. FlexSearch's default encoder splits
 * on it (`/[\p{Z}\p{S}\p{P}\p{C}]+/u`), which turned "0.4" into "0" and "4", both under
 * `FLEXSEARCH_MIN_TERM_LENGTH` — so a decimal spec ("0.4", "1.5"), a fraction ("3/4") or
 * a short code ("K-2") could never be indexed or queried, and "modelX 0.4" silently
 * degraded to "modelX". The server searches `LIKE '%term%'` per whitespace-split term
 * with punctuation literal, and wp-admin does the same.
 *
 * Bump `SEARCH_INDEX_VERSION` in `@wcpos/database` whenever any of this changes: the
 * persisted index is not re-tokenized in place.
 */
export const FLEXSEARCH_TOKEN_BOUNDARY = /[\p{Z}\p{C}",+]+/u;

/**
 * Longest term kept whole with its punctuation.
 *
 * `tokenize: 'full'` indexes every substring of a term, so the cost is quadratic in
 * term length: a 16-character term is 105 substrings, a 30-character email is 406,
 * and those substrings are unique per email rather than shared like words. Specs,
 * fractions, SKUs, barcodes and phone numbers fit under the cap; emails, URLs and the
 * error strings in the logs index mostly do not and fall back to the punctuation
 * split, which is exactly what they got before — nothing indexes larger than it did.
 */
export const FLEXSEARCH_LITERAL_TERM_MAX_LENGTH = 16;

const PUNCTUATION = /[\p{P}\p{S}]+/u;
/** Punctuation wrapping a term — `'0.4'`, `(shirt)`, `shirt!` — is not part of it. */
const WRAPPING_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

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
	return foldSearchText(value)
		.split(FLEXSEARCH_TOKEN_BOUNDARY)
		.flatMap((term) => {
			const literal = term.replace(WRAPPING_PUNCTUATION, '');
			return literal.length > FLEXSEARCH_LITERAL_TERM_MAX_LENGTH
				? literal.split(PUNCTUATION)
				: [literal];
		})
		.filter(Boolean);
}
