import {
	EMPTY_ENTRY,
	type QuantityEntry,
	type QuantityEntryAction,
	quantityEntryReducer,
	typedQuantity,
} from './reducer';

const run = (...actions: QuantityEntryAction[]): QuantityEntry =>
	actions.reduce(quantityEntryReducer, EMPTY_ENTRY);
const digits = (text: string): QuantityEntryAction[] =>
	[...text].map((char) => (char === '.' ? { type: 'decimal' } : { type: 'digit', digit: char }));

describe('quantityEntryReducer', () => {
	it('the first digit replaces the shown number, later digits append', () => {
		expect(run(...digits('1')).buffer).toBe('1');
		expect(run(...digits('12')).buffer).toBe('12');
	});

	it('backspace to empty gives the stored value back (nothing typed)', () => {
		const entry = run(...digits('12'), { type: 'backspace' }, { type: 'backspace' });
		expect(entry.buffer).toBe('');
		expect(typedQuantity(entry.buffer)).toBeUndefined();
		expect(run({ type: 'backspace' }).buffer).toBe('');
	});

	it('a lone 0 never commits, and the next digit takes its place', () => {
		expect(typedQuantity(run(...digits('0')).buffer)).toBeUndefined();
		expect(run(...digits('05')).buffer).toBe('5');
		expect(typedQuantity(run(...digits('0.0')).buffer)).toBeUndefined();
	});

	it('12 commits 12', () => {
		expect(typedQuantity(run(...digits('12')).buffer)).toBe(12);
	});

	it('takes the decimal point once, and a leading 0 before it', () => {
		expect(run(...digits('1.5.')).buffer).toBe('1.5');
		expect(run(...digits('.5')).buffer).toBe('0.5');
		expect(typedQuantity(run(...digits('.5')).buffer)).toBe(0.5);
	});

	it('stops a fraction at six places, as the edit-line sheet does', () => {
		expect(run(...digits('0.0000019')).buffer).toBe('0.000001');
		expect(typedQuantity('0.000001')).toBe(0.000001);
	});

	it('stops the whole number at four digits; a fraction may follow', () => {
		expect(run(...digits('12345')).buffer).toBe('1234');
		expect(run(...digits('1234.5')).buffer).toBe('1234.5');
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
		const stepped = run(...digits('7'), { type: 'step', quantity: 4 });
		expect(stepped).toEqual({ buffer: '', stepped: 4 });
		expect(quantityEntryReducer(stepped, { type: 'reset' })).toBe(EMPTY_ENTRY);
	});
});

describe('typedQuantity', () => {
	it('reads the buffer, which always carries a "." whatever the store separator', () => {
		expect(typedQuantity('2.25')).toBe(2.25);
		expect(typedQuantity('')).toBeUndefined();
	});
});

describe('a count (stock)', () => {
	const whole = (text: string): QuantityEntryAction[] =>
		[...text].map((digit) => ({ type: 'digit', digit, places: 0, whole: 6 }));

	it('takes six whole digits, not four', () => {
		expect(run(...whole('1234567')).buffer).toBe('123456');
		expect(run(...digits('12345')).buffer).toBe('1234');
	});

	it('a typed 0 is a stock level; nothing typed is still nothing', () => {
		expect(typedQuantity(run(...whole('0')).buffer, true)).toBe(0);
		expect(typedQuantity('', true)).toBeUndefined();
		expect(typedQuantity('0')).toBeUndefined();
	});
});
