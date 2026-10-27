/**
 * The quantity keypad's entry, pure. `buffer` is what has been typed, always with a `.` for
 * the decimal point (the store's separator is the caller's display); `stepped` is the number
 * a − or + last committed, shown until the stored quantity catches up.
 */
export type QuantityEntry = { buffer: string; stepped?: number };

export type QuantityEntryAction =
	/** `places` and `whole` default to a cart line's: six places, four whole digits. */
	| { type: 'digit'; digit: string; places?: number; whole?: number }
	| { type: 'decimal' }
	| { type: 'backspace' }
	| { type: 'step'; quantity: number }
	| { type: 'unstep'; quantity: number }
	| { type: 'settle' }
	| { type: 'reset' };

export const EMPTY_ENTRY: QuantityEntry = { buffer: '' };

/**
 * A quantity's decimal places: six, as the edit-line sheet takes and the cart shows them
 * (`QUANTITY_FORMAT`), so a typed fraction or a step never cuts a line's own digits.
 */
export const QUANTITY_PLACES = 6;
// Four: a line never holds 10 000, and "9999" is what the 48 px cell fits.
const INTEGER_DIGITS = 4;
/** A count (stock) holds more than a line: six whole digits, the cell's text shrinks for them. */
export const COUNT_DIGITS = 6;

export function quantityEntryReducer(
	entry: QuantityEntry,
	action: QuantityEntryAction
): QuantityEntry {
	const { buffer } = entry;
	switch (action.type) {
		case 'digit': {
			const { places = QUANTITY_PLACES, whole = INTEGER_DIGITS } = action;
			const point = buffer.indexOf('.');
			if (point >= 0 && buffer.length - point > places) return entry;
			// A lone 0 only ever starts a fraction: the next digit takes its place.
			const next = buffer === '0' ? action.digit : buffer + action.digit;
			return point < 0 && next.length > whole ? entry : { ...entry, buffer: next };
		}
		case 'decimal':
			return buffer.includes('.') ? entry : { ...entry, buffer: `${buffer || '0'}.` };
		case 'backspace':
			return { ...entry, buffer: buffer.slice(0, -1) };
		case 'step':
			return { buffer: '', stepped: action.quantity };
		// The store refused that step: show what it holds again, unless a later step moved on.
		case 'unstep':
			return entry.stepped === action.quantity ? { buffer } : entry;
		// The stored quantity moved with no step in flight: it is the truth, the typing stays.
		case 'settle':
			return entry.stepped === undefined ? entry : { buffer };
		case 'reset':
			return EMPTY_ENTRY;
	}
}

/**
 * The typed quantity when it is one a line can hold; nothing typed, or zero, is `undefined`.
 * A count (`zero`) holds 0: out of stock is a real stock level.
 */
export function typedQuantity(buffer: string, zero = false): number | undefined {
	const quantity = Number.parseFloat(buffer);
	return quantity > 0 || (zero && quantity === 0) ? quantity : undefined;
}
