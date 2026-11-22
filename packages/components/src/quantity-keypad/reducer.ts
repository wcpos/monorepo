import { typeDecimal } from '../lib/decimal-entry';

/**
 * The quantity keypad's entry, pure. `buffer` is what has been typed, always with a `.` for
 * the decimal point (the store's separator is the caller's display); `stepped` is the number
 * a − or + last committed, shown until the stored quantity catches up.
 */
export type QuantityEntry = {
	buffer: string;
	stepped?: number;
	/** The buffer is the shown quantity negated by ±, not typed: the first key still replaces it. */
	negated?: true;
};

export type QuantityEntryAction =
	/**
	 * Whole digits are never capped: a cashier is never stopped (Paul 2026-10-30);
	 * the display shrinks, then truncates.
	 */
	| { type: 'key'; key: string; places: number }
	| { type: 'step'; quantity: number }
	| { type: 'unstep'; quantity: number }
	| { type: 'settle' }
	| { type: 'reset' }
	/**
	 * ± (a signed keypad): negates the number being entered, as a calculator does. With
	 * something typed it toggles the buffer's leading `-`; with nothing typed the buffer becomes
	 * the negated `shown` quantity, so Done commits it and Escape keeps the stored one.
	 */
	| { type: 'sign'; shown: number };

export const EMPTY_ENTRY: QuantityEntry = { buffer: '' };

/** The entry with `buffer` typed: no longer a negated shown quantity. */
const typedEntry = ({ stepped }: QuantityEntry, buffer: string): QuantityEntry =>
	stepped === undefined ? { buffer } : { buffer, stepped };

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
			// The digits are typed on the magnitude; the sign stays in front (`-1` then 2 is `-12`),
			// and deleting the last digit empties the buffer, sign and all.
			// A negated shown quantity is replaced as the shown one is (line 30), keeping its sign.
			const minus = buffer.startsWith('-');
			const magnitude = entry.negated ? '' : minus ? buffer.slice(1) : buffer;
			const digits = typeDecimal(magnitude, action.key, action.places);
			const typed = minus && digits ? `-${digits}` : digits;
			return typed === buffer && !entry.negated ? entry : typedEntry(entry, typed);
		}
		case 'sign': {
			// ± again on a negated shown quantity shows the stored one: nothing typed.
			if (entry.negated) return typedEntry(entry, '');
			if (buffer) return typedEntry(entry, buffer.startsWith('-') ? buffer.slice(1) : `-${buffer}`);
			// The shown number lies on the six-place grid, so its plain digits are what was typed.
			const negated = -action.shown;
			return negated === 0 ? entry : { ...entry, buffer: String(negated), negated: true };
		}
		case 'step':
			return { buffer: '', stepped: action.quantity };
		// The store refused that step: show what it holds again, unless a later step moved on.
		case 'unstep':
			return entry.stepped === action.quantity ? { ...entry, stepped: undefined } : entry;
		// The stored quantity moved with no step in flight: it is the truth, the typing stays.
		case 'settle':
			return entry.stepped === undefined ? entry : { ...entry, stepped: undefined };
		case 'reset':
			return EMPTY_ENTRY;
	}
}

/**
 * The typed quantity when it is one a line can hold; nothing typed, or zero, is `undefined`.
 * A count (`zero`) holds 0: out of stock is a real stock level. A `signed` line holds a nonzero
 * negative (a return inside the sale); 0 and −0 still never commit a line.
 */
export function typedQuantity(buffer: string, zero = false, signed = false): number | undefined {
	const quantity = Number.parseFloat(buffer);
	return quantity > 0 || (signed && quantity < 0) || (zero && quantity === 0)
		? quantity
		: undefined;
}
