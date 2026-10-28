import {
	EMPTY_ENTRY,
	LINE_DIGITS,
	QUANTITY_PLACES,
	type QuantityEntry,
	type QuantityEntryAction,
	quantityEntryReducer,
	typedQuantity,
} from './reducer';

// The buffer rules themselves are `lib/decimal-entry.test.ts`; this is the quantity's own keys.
const run = (...actions: QuantityEntryAction[]): QuantityEntry =>
	actions.reduce(quantityEntryReducer, EMPTY_ENTRY);
const keys = (text: string, places = QUANTITY_PLACES, whole = LINE_DIGITS): QuantityEntryAction[] =>
	[...text].map((char) => ({ type: 'key', key: char === '.' ? 'decimal' : char, places, whole }));

describe('quantityEntryReducer', () => {
	it('types through the decimal entry at the given places and whole digits', () => {
		expect(run(...keys('12345.5')).buffer).toBe('1234.5');
		expect(run(...keys('1234567', 0, 6)).buffer).toBe('123456');
	});

	it('typing keeps a stepped number until the stored quantity settles', () => {
		expect(run({ type: 'step', quantity: 4 }, ...keys('2'))).toEqual({ buffer: '2', stepped: 4 });
	});

	it('unstep forgets a refused step, keeps the typing, and ignores a step it no longer shows', () => {
		const stepped: QuantityEntry = { buffer: '', stepped: 4 };
		expect(quantityEntryReducer(stepped, { type: 'unstep', quantity: 4 })).toEqual({ buffer: '' });
		expect(
			quantityEntryReducer({ buffer: '7', stepped: 4 }, { type: 'unstep', quantity: 4 })
		).toEqual({ buffer: '7' });
		expect(quantityEntryReducer(stepped, { type: 'unstep', quantity: 5 })).toBe(stepped);
	});

	it('a step clears the typing and remembers the committed number; reset forgets both', () => {
		const stepped = run(...keys('7'), { type: 'step', quantity: 4 });
		expect(stepped).toEqual({ buffer: '', stepped: 4 });
		expect(quantityEntryReducer(stepped, { type: 'reset' })).toBe(EMPTY_ENTRY);
	});
});

describe('typedQuantity', () => {
	it('reads the buffer, which always carries a "." whatever the store separator', () => {
		expect(typedQuantity('2.25')).toBe(2.25);
		expect(typedQuantity('0.000001')).toBe(0.000001);
		expect(typedQuantity('')).toBeUndefined();
	});

	it('a lone 0 never commits a line; a typed 0 is a stock level', () => {
		expect(typedQuantity('0')).toBeUndefined();
		expect(typedQuantity('0.0')).toBeUndefined();
		expect(typedQuantity('0', true)).toBe(0);
		expect(typedQuantity('', true)).toBeUndefined();
	});
});

describe('settle', () => {
	it('drops the stepped number and keeps what was typed', () => {
		const stepped = run({ type: 'step', quantity: 4 }, ...keys('2'));
		expect(quantityEntryReducer(stepped, { type: 'settle' })).toEqual({ buffer: '2' });
	});

	it('with no step, changes nothing', () => {
		const typed = run(...keys('2'));
		expect(quantityEntryReducer(typed, { type: 'settle' })).toBe(typed);
	});
});
