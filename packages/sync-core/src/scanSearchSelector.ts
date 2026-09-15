/**
 * The scan-based search for a collection that refuses a FlexSearch index (logs:
 * a 46k-row day cost 21.5 s and ~350 MB to index in the renderer, 2026-09-15).
 *
 * Parity with the index comes from folding BOTH operands with the same function:
 * the writer stores `foldSearchText(...)` of the searched fields in one folded
 * field, and the query folds the typed term through the same encoder. A regex
 * over the folded field is then an exact substring match in fold space — every
 * script, every normal form, every case pair — with no per-script widening.
 * Rows written before the folded field existed are searched through the raw
 * fields with the folded token (ASCII-faithful, best effort); retention retires
 * them within 30 days.
 *
 * Pure: builds a mango selector the storage evaluates (in the OPFS worker on
 * web, off the main thread), bounded by the caller's own limit.
 */
import { encodeSearchText, FLEXSEARCH_MIN_TERM_LENGTH } from './searchIndexConfig';

export type ScanSearchArm = Record<string, { $regex: string; $options?: string }>;
export type ScanSearchSelector = { $and: { $or: ScanSearchArm[] }[] };

/** The encoder's terms, minus those under the index minimum — "pull x" means "pull". */
export function scanSearchTerms(search: string): string[] {
	return encodeSearchText(search).filter((term) => term.length >= FLEXSEARCH_MIN_TERM_LENGTH);
}

export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/**
 * Every term must appear in the folded field or, for rows that predate it, in
 * one of the raw fields. `null` means nothing can be selected (no fields, or a
 * term with no usable token) — callers turn that into "no hits", never "all rows".
 */
export function buildScanSearchSelector(input: {
	foldedField?: string;
	rawFields: readonly string[];
	search: string;
}): ScanSearchSelector | null {
	const terms = scanSearchTerms(input.search);
	const fields = [
		...(input.foldedField ? [{ field: input.foldedField, folded: true }] : []),
		...input.rawFields.map((field) => ({ field, folded: false })),
	];
	if (terms.length === 0 || fields.length === 0) return null;
	return {
		$and: terms.map((term) => ({
			$or: fields.map(({ field, folded }) => ({
				[field]: folded
					? { $regex: escapeRegex(term) }
					: { $regex: escapeRegex(term), $options: 'i' },
			})),
		})),
	};
}
