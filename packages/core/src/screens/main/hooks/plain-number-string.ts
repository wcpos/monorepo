/**
 * A number as plain digits, never in exponent form. `Number#toString` switches to "1.11e+21"
 * at 1e21 and to "1e-7" below 1e-7, and react-number-format reads the digits it finds in
 * that, so a price typed as twenty-two 1s showed as 1,11 (Paul, 2026-10-30). The digits are
 * the number's own shortest round-trip form: what the float holds, as toString prints it.
 */
export function plainNumberString(value: number): string {
	const text = String(value);
	const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
	if (!match) return text;
	const [, sign, whole, fraction = '', exponent] = match;
	const digits = whole + fraction;
	// Where the point lands, counted from the start of `digits`.
	const point = whole.length + Number(exponent);
	if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
	if (point > 0) return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
	return `${sign}0.${'0'.repeat(-point)}${digits}`;
}
