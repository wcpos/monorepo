/**
 * Typing a decimal number on a keypad, pure. The buffer always holds `.` for the point: the
 * store's separator is the caller's to show and to read back. A key the buffer refuses returns
 * it unchanged. Every keypad that types a number types it here (the price and quantity keypads'
 * entries, the register's cash movements).
 *
 * - `0`–`9` append; a lone `0` only ever starts a fraction, so the next digit takes its place.
 * - `decimal` adds the point once, after a `0` when nothing was typed; never with no `places`.
 * - `backspace` deletes the last character.
 * - The fraction stops at `places`, the whole part at `whole` digits.
 */
export function typeDecimal(buffer: string, key: string, places: number, whole = Infinity): string {
	if (key === 'backspace') return buffer.slice(0, -1);
	if (key === 'decimal') return places > 0 && !buffer.includes('.') ? `${buffer || '0'}.` : buffer;
	if (!/^[0-9]$/.test(key)) return buffer;
	const point = buffer.indexOf('.');
	if (point >= 0) return buffer.length - point > places ? buffer : buffer + key;
	const next = buffer === '0' ? key : buffer + key;
	return next.length > whole ? buffer : next;
}
