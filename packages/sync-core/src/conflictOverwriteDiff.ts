/**
 * What an order-conflict auto-recovery (#1204) OVERWRITES on the server.
 *
 * The first 409 carries the server's current document; the recovery re-pushes
 * the till's own payload over it (monorepo#1601). This names the fields where
 * the two disagreed — the other party's edit that the till just replaced — so
 * the frequency and shape of real lost updates become visible in the logs.
 * It is a diagnostic: nothing here changes what is pushed.
 *
 * Comparison rules, each chosen to avoid false alarms rather than to be strict:
 *  - only keys present on BOTH sides count. The server document may be a trimmed
 *    projection, and the till cannot overwrite what it did not send.
 *  - a few top-level keys are skipped outright: `date_modified*` move on every
 *    write, `_links`/`_rxdb_digest` are transport, and Woo MERGES `meta_data` by
 *    key on PUT, so a differing entry is not an overwrite.
 *  - money width is not a change: `"6.713280"` and `"6.71"` are the same number
 *    at two serialization widths (#946), so decimals compare at the shorter
 *    precision. `"6.72"` vs `"6.713280"` still differs. Only CANONICAL decimal
 *    literals qualify — a leading zero or a `+` sign (`"01234"`, `"+44123"`: a
 *    postcode, a phone number) is text, and text compares exactly.
 *  - arrays whose server elements all carry an `id` (line items, fees, shipping)
 *    match by id — an id on one side only is one path (`line_items[12]`), a
 *    matched pair recurses. A pushed element WITHOUT an id is an append Woo will
 *    add, never an overwrite. Id-less arrays compare positionally and report a
 *    length difference once (`taxes.length`).
 *  - total over any JSON-ish input: a malformed shape yields paths, never a throw.
 */
const MAX_DEPTH = 6;
const DECIMAL_LITERAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const SKIPPED_TOP_LEVEL = new Set([
	'date_modified',
	'date_modified_gmt',
	'_links',
	'meta_data',
	'_rxdb_digest',
]);
type ObjectValue = Record<string, unknown>;
const objectValue = (value: unknown): value is ObjectValue =>
	value !== null && typeof value === 'object' && !Array.isArray(value);
const identified = (value: unknown): value is ObjectValue & { id: unknown } =>
	objectValue(value) && value.id !== undefined;
function decimalText(value: unknown): string | null {
	if (typeof value === 'string') return DECIMAL_LITERAL.test(value) ? value : null;
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	const text = String(value);
	if (!/[eE]/.test(text)) return text;
	const [mantissa, exponentText] = text.toLowerCase().split('e');
	const sign = mantissa.startsWith('-') ? '-' : '';
	const [whole, fraction = ''] = mantissa.replace(/^[+-]/, '').split('.');
	const digits = `${whole}${fraction}`;
	const decimalAt = whole.length + Number(exponentText);
	if (decimalAt <= 0) return `${sign}0.${'0'.repeat(-decimalAt)}${digits}`;
	if (decimalAt >= digits.length) return `${sign}${digits}${'0'.repeat(decimalAt - digits.length)}`;
	return `${sign}${digits.slice(0, decimalAt)}.${digits.slice(decimalAt)}`;
}
function moneyEqual(left: unknown, right: unknown): boolean {
	const leftText = decimalText(left);
	const rightText = decimalText(right);
	if (leftText === null || rightText === null) return false;
	const decimals = Math.min(
		leftText.split('.')[1]?.length ?? 0,
		rightText.split('.')[1]?.length ?? 0
	);
	const scaled = (text: string): bigint => {
		const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
		const value = BigInt(`${whole}${fraction.slice(0, decimals).padEnd(decimals, '0')}`);
		return text.startsWith('-') ? -value : value;
	};
	return scaled(leftText) === scaled(rightText);
}
/** Returns the fields a successful conflict recovery overwrites on the server document. */
export function diffConflictOverwrite(pushed: ObjectValue, server: ObjectValue): string[] {
	const paths: string[] = [];
	const compare = (left: unknown, right: unknown, path: string, depth: number): void => {
		if (depth > MAX_DEPTH || Object.is(left, right) || moneyEqual(left, right)) return;
		if (Array.isArray(left) && Array.isArray(right)) {
			if (depth === MAX_DEPTH) return;
			if (right.every(identified) && left.every(objectValue)) {
				const pushedById = new Map(left.filter(identified).map((item) => [item.id, item]));
				const serverById = new Map(right.map((item) => [item.id, item]));
				for (const [id, item] of pushedById) {
					const itemPath = `${path}[${String(id)}]`;
					if (serverById.has(id)) compare(item, serverById.get(id), itemPath, depth + 1);
					else paths.push(itemPath);
				}
				for (const id of serverById.keys()) {
					if (!pushedById.has(id)) paths.push(`${path}[${String(id)}]`);
				}
				return;
			}
			if (left.length !== right.length) paths.push(`${path}.length`);
			for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
				compare(left[index], right[index], `${path}[${index}]`, depth + 1);
			}
			return;
		}
		if (objectValue(left) && objectValue(right)) {
			for (const key of Object.keys(left)) {
				if ((depth === 0 && SKIPPED_TOP_LEVEL.has(key)) || !(key in right)) continue;
				compare(left[key], right[key], path ? `${path}.${key}` : key, depth + 1);
			}
			return;
		}
		if (path) paths.push(path);
	};
	compare(pushed, server, '', 0);
	return paths.sort();
}
