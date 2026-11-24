import {
	EMPTY_ENTRY,
	QUANTITY_PLACES,
	type QuantityEntry,
	type QuantityEntryAction,
	quantityEntryReducer,
	typedQuantity,
} from './reducer';

// The buffer rules themselves are `lib/decimal-entry.test.ts`; this is the quantity's own keys.
const run = (...actions: QuantityEntryAction[]): QuantityEntry =>
	actions.reduce(quantityEntryReducer, EMPTY_ENTRY);
const keys = (text: string, places = QUANTITY_PLACES): QuantityEntryAction[] =>
	[...text].map((char) => ({ type: 'key', key: char === '.' ? 'decimal' : char, places }));

describe('quantityEntryReducer', () => {
	it('takes any number of whole digits: a cashier is never stopped', () => {
		expect(run(...keys('12345.5')).buffer).toBe('12345.5');
		expect(run(...keys('12345678', 0)).buffer).toBe('12345678');
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

describe('± (a signed keypad)', () => {
	const sign = (shown: number): QuantityEntryAction => ({ type: 'sign', shown });

	it('with nothing typed, the buffer becomes the negated shown quantity', () => {
		expect(run(sign(3)).buffer).toBe('-3');
		expect(run(sign(-2)).buffer).toBe('2');
		expect(run(sign(1.5)).buffer).toBe('-1.5');
	});

	it('a shown 0 stays nothing typed: −0 is never entered', () => {
		expect(run(sign(0))).toBe(EMPTY_ENTRY);
	});

	it('with something typed, it toggles the leading sign', () => {
		expect(run(...keys('12'), sign(3)).buffer).toBe('-12');
		expect(run(...keys('12'), sign(3), sign(3)).buffer).toBe('12');
	});

	it('digits type on the magnitude and keep the sign; deleting the last empties it', () => {
		expect(run(...keys('1'), sign(3), ...keys('2')).buffer).toBe('-12');
		expect(run(...keys('1'), sign(3), { type: 'key', key: 'backspace', places: 6 }).buffer).toBe(
			''
		);
	});

	it('the first digit after ± on the shown quantity replaces it, keeping the sign', () => {
		expect(run(sign(3), ...keys('4'))).toEqual({ buffer: '-4' });
		expect(run(sign(3), sign(3))).toEqual({ buffer: '' });
	});

	it('typedQuantity takes a nonzero negative only when signed; 0 and −0 never commit', () => {
		expect(typedQuantity('-1')).toBeUndefined();
		expect(typedQuantity('-1', false, true)).toBe(-1);
		expect(typedQuantity('-0', false, true)).toBeUndefined();
		expect(typedQuantity('0', false, true)).toBeUndefined();
		expect(typedQuantity('-', false, true)).toBeUndefined();
	});
});
