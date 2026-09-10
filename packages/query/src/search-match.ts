import { encodeSearchText, FLEXSEARCH_MIN_TERM_LENGTH, foldSearchText } from '@wcpos/sync-core';

/** The scan fallback's tokens: the index encoder's output, minus terms under its minimum. */
export function searchTokens(search: string): string[] {
	return encodeSearchText(search).filter((token) => token.length >= FLEXSEARCH_MIN_TERM_LENGTH);
}

/** AND across pre-computed tokens over the folded cross-field blob — `tokenize:'full'` by hand. */
export function fieldsMatchTokens(fields: string[], tokens: string[]): boolean {
	if (tokens.length === 0 || fields.length === 0) return false;
	const blob = foldSearchText(fields.join(' '));
	return tokens.every((token) => blob.includes(token));
}

/** `fieldsMatchTokens` for one query; a scan over many documents tokenizes once and uses the former. */
export function fieldsMatchSearch(fields: string[], search: string): boolean {
	return fieldsMatchTokens(fields, searchTokens(search));
}

/** A term under the index minimum matches when any whitespace token starts with it. */
export function fieldsMatchShortPrefix(fields: string[], prefix: string): boolean {
	return fields.some((field) =>
		field.split(/\s+/).some((token) => foldSearchText(token).startsWith(prefix))
	);
}

/** The false-hit audit: a document the index returned that no field actually contains. */
export function fieldsMissAnyOfTokens(fields: string[], tokens: string[]): boolean {
	if (tokens.length === 0 || fields.length === 0) return false;
	return tokens.some((token) => fields.every((field) => !foldSearchText(field).includes(token)));
}

export function fieldsMissAnyToken(fields: string[], search: string): boolean {
	return fieldsMissAnyOfTokens(fields, searchTokens(search));
}
