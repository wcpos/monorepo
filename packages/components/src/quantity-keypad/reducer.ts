import { typeDecimal } from '../lib/decimal-entry';

/**
 * The quantity keypad's entry, pure. `buffer` is what has been typed, always with a `.` for
 * the decimal point (the store's separator is the caller's display); `stepped` is the number
 * a − or + last committed, shown until the stored quantity catches up.
 */
export type QuantityEntry = { buffer: string; stepped?: number };

export type QuantityEntryAction =
	/**
	 * Whole digits are never capped: a cashier is never stopped (Paul 2026-10-30);
	 * the display shrinks, then truncates.
	 */
	| { type: 'key'; key: string; places: number }
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

export function quantityEntryReducer(
	entry: QuantityEntry,
	action: QuantityEntryAction
): QuantityEntry {
	const { buffer } = entry;
	switch (action.type) {
		case 'key': {
			const typed = typeDecimal(buffer, action.key, action.places);
			return typed === buffer ? entry : { ...entry, buffer: typed };
		}
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
