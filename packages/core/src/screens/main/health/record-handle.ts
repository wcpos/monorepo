type LabelSource = Record<string, unknown> | null | undefined;

/**
 * Best-effort human handle for a record: products and variations by name,
 * orders by `#number · total`, customers by first/last name, then username,
 * coupons by code.
 *
 * Each source is read top-level first, then through its `payload` (stored
 * records keep promoted columns beside the Woo payload), and earlier sources
 * win — so a caller can put the resident ahead of a queued snapshot whose
 * partial UPDATE payload may carry no name at all. Null when nothing names it.
 */
export function recordHandle(...sources: LabelSource[]): string | null {
	const pick = (key: string): unknown => {
		for (const source of sources) {
			if (!source) continue;
			const payload = source.payload as Record<string, unknown> | undefined;
			const value = source[key] ?? payload?.[key];
			if (value !== undefined && value !== null) return value;
		}
		return undefined;
	};
	const name = pick('name');
	if (typeof name === 'string' && name.trim() !== '') return name.trim();
	const number = pick('number');
	if (typeof number === 'string' || typeof number === 'number') {
		const total = pick('total');
		return typeof total === 'string' && total !== '' ? `#${number} · ${total}` : `#${number}`;
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
