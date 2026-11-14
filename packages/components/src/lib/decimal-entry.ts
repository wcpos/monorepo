/**
 * Typing a decimal on any keypad, pure; the buffer holds `.`, a refused key returns it unchanged.
 * A lone `0` only starts a fraction; no point without `places`; whole digits are never capped.
 */
export function typeDecimal(buffer: string, key: string, places: number): string {
	if (key === 'backspace') return buffer.slice(0, -1);
	if (key === 'decimal') return places > 0 && !buffer.includes('.') ? `${buffer || '0'}.` : buffer;
	if (!/^[0-9]$/.test(key)) return buffer;
	const point = buffer.indexOf('.');
	if (point >= 0) return buffer.length - point > places ? buffer : buffer + key;
	return buffer === '0' ? key : buffer + key;
}
