/**
 * Whether two tender maps describe the same count.
 *
 * The server normalises amounts to four decimals ('080' → '80.0000') and the app sends what
 * the cashier typed, so the approval binding compares by tender and numeric value, never by
 * string identity. Missing and zero tenders are not the same count: a tender the manager saw
 * and one the cashier later removed differ.
 */
export function isSameCount(
	a: Readonly<Record<string, string>> | null | undefined,
	b: Readonly<Record<string, string>> | null | undefined
): boolean {
	if (!a || !b) return false;
	const keys = Object.keys(a).sort();
	if (keys.join('\u0000') !== Object.keys(b).sort().join('\u0000')) return false;
	return keys.every((key) => {
		const left = Number(a[key]);
		const right = Number(b[key]);
		return Number.isFinite(left) && Number.isFinite(right) && left === right;
	});
}
