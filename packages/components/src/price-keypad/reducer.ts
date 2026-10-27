import round from 'lodash/round';

/**
 * The price keypad's entry, pure. `buffer` is what has been typed, always with a `.` for the
 * decimal point (the store's separator is the caller's display); `discount` is the quick key
 * that is lit, a percentage off the stored price. Empty: the stored price is shown.
 */
export type PriceEntry = { buffer: string; discount?: number };

export type PriceEntryAction =
	| { type: 'digit'; digit: string; places: number }
	| { type: 'decimal' }
	| { type: 'backspace' }
	| { type: 'discount'; percent: number }
	| { type: 'reset' };

export const EMPTY_PRICE: PriceEntry = { buffer: '' };

// The 192 px display fits ten characters ("1234567.50"). A currency with fewer places gives the
// whole number the room back: a rupiah or dong price passes 9 999 999 (CodeRabbit on #2984).
const DISPLAY_CHARS = 10;
const MIN_INTEGER_DIGITS = 7;
const integerDigits = (places: number) =>
	Math.max(MIN_INTEGER_DIGITS, DISPLAY_CHARS - (places > 0 ? places + 1 : 0));

export function priceEntryReducer(entry: PriceEntry, action: PriceEntryAction): PriceEntry {
	// Typing after a quick key starts over: the discount is gone, the buffer empty.
	const buffer = entry.discount === undefined ? entry.buffer : '';
	switch (action.type) {
		case 'digit': {
			const point = buffer.indexOf('.');
			if (point >= 0 && buffer.length - point > action.places) return { buffer };
			// A lone 0 only ever starts a fraction: the next digit takes its place.
			const next = buffer === '0' ? action.digit : buffer + action.digit;
			return {
				buffer: point < 0 && next.length > integerDigits(action.places) ? buffer : next,
			};
		}
		case 'decimal':
			return { buffer: buffer.includes('.') ? buffer : `${buffer || '0'}.` };
		case 'backspace':
			return { buffer: buffer.slice(0, -1) };
		// The lit key again puts the stored price back.
		case 'discount':
			return entry.discount === action.percent
				? EMPTY_PRICE
				: { buffer: '', discount: action.percent };
		case 'reset':
			return EMPTY_PRICE;
	}
}

/**
 * The price a close would write: what was typed (0 is a free line), else the stored price less
 * the lit discount at the currency's places, else nothing. A lone decimal press (`0.`) is not
 * typing, so a stray tap never zeroes the line.
 */
export function draftPrice(entry: PriceEntry, stored: number, places: number): number | undefined {
	if (entry.buffer && entry.buffer !== '0.') return Number.parseFloat(entry.buffer);
	if (entry.discount !== undefined) return round(stored * (1 - entry.discount / 100), places);
	return undefined;
}
