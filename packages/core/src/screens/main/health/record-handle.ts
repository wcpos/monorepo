import { resolveVariationName } from '../components/product/resolve-variation-name';

type LabelSource = Record<string, unknown> | null | undefined;

const trimmed = (value: unknown): string =>
	typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

/**
 * Best-effort human handle for a record: products by name, variations by
 * their own attribute options, orders by `#number · total` (a born-local
 * order with no number yet by billing name and total), customers by
 * first/last name, then username, coupons by code.
 *
 * Each source is read top-level first, then through its `payload` (stored
 * records keep promoted columns beside the Woo payload), and earlier sources
 * win — so a caller can put the resident ahead of a queued snapshot whose
 * partial UPDATE payload may carry no name at all. Null when nothing names it.
 */
export function recordHandle(collection: string, ...sources: LabelSource[]): string | null {
	const pick = (key: string): unknown => {
		for (const source of sources) {
			if (!source) continue;
			const payload = source.payload as Record<string, unknown> | undefined;
			// A blank value names nothing: skip it so the payload, or a later
			// source, still gets its turn.
			for (const value of [source[key], payload?.[key]]) {
				if (value === undefined || value === null) continue;
				if (typeof value === 'string' && value.trim() === '') continue;
				return value;
			}
		}
		return undefined;
	};
	// A variation's stored name can be just the parent's (Woo collapses it at
	// three or more attributes), so every sibling would read the same.
	if (collection === 'variations') {
		const composed = resolveVariationName({
			name: pick('name'),
			attributes: pick('attributes'),
		}).trim();
		if (composed !== '') return composed;
	}
	const name = pick('name');
	if (typeof name === 'string' && name.trim() !== '') return name.trim();
	const number = trimmed(pick('number'));
	const total = trimmed(pick('total'));
	if (number !== '') return total !== '' ? `#${number} · ${total}` : `#${number}`;
	// A sale rejected before the store numbered it: who it was for and how much,
	// so several stranded sales stay distinguishable.
	if (collection === 'orders') {
		const billing = (pick('billing') ?? {}) as Record<string, unknown>;
		const billed = [trimmed(billing.first_name), trimmed(billing.last_name)]
			.filter((part) => part !== '')
			.join(' ');
		const parts = [billed, total].filter((part) => part !== '');
		if (parts.length > 0) return parts.join(' · ');
	}
	const person = [pick('first_name'), pick('last_name')]
		.filter((part): part is string => typeof part === 'string' && part.trim() !== '')
		.map((part) => part.trim())
		.join(' ');
	if (person !== '') return person;
	const username = pick('username');
	if (typeof username === 'string' && username !== '') return username;
	// Coupons have no name; the code is what the merchant knows them by.
	const code = pick('code');
	return typeof code === 'string' && code.trim() !== '' ? code.trim() : null;
}
