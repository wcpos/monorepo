/**
 * The quantity keypad's entry, pure. `buffer` is what has been typed, always with a `.` for
 * the decimal point (the store's separator is the caller's display); `stepped` is the number
 * a − or + last committed, shown until the stored quantity catches up.
 */
export type QuantityEntry = { buffer: string; stepped?: number };

export type QuantityEntryAction =
	| { type: 'digit'; digit: string }
	| { type: 'decimal' }
	| { type: 'backspace' }
	| { type: 'step'; quantity: number }
	| { type: 'reset' };

export const EMPTY_ENTRY: QuantityEntry = { buffer: '' };

// Three places: a typed fraction never commits under 0.001, the smallest quantity a line takes.
const FRACTION_DIGITS = 3;

export function quantityEntryReducer(
	entry: QuantityEntry,
	action: QuantityEntryAction
): QuantityEntry {
	const { buffer } = entry;
	switch (action.type) {
		case 'digit': {
			const point = buffer.indexOf('.');
			if (point >= 0 && buffer.length - point > FRACTION_DIGITS) return entry;
			// A lone 0 only ever starts a fraction: the next digit takes its place.
			return { ...entry, buffer: buffer === '0' ? action.digit : buffer + action.digit };
		}
		case 'decimal':
			return buffer.includes('.') ? entry : { ...entry, buffer: `${buffer || '0'}.` };
		case 'backspace':
			return { ...entry, buffer: buffer.slice(0, -1) };
		case 'step':
			return { buffer: '', stepped: action.quantity };
		case 'reset':
			return EMPTY_ENTRY;
	}
}

/** The typed quantity when it is one a line can hold; nothing typed, or zero, is `undefined`. */
export function typedQuantity(buffer: string): number | undefined {
	const quantity = Number.parseFloat(buffer);
	return quantity > 0 ? quantity : undefined;
}
