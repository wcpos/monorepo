import {
	draftPrice,
	EMPTY_PRICE,
	type PriceEntry,
	type PriceEntryAction,
	priceEntryReducer,
} from './reducer';

const run = (...actions: PriceEntryAction[]): PriceEntry =>
	actions.reduce(priceEntryReducer, EMPTY_PRICE);
// The buffer rules themselves are `lib/decimal-entry.test.ts`; this is the price's own keys.
const typed = (text: string, places = 2): PriceEntryAction[] =>
	[...text].map((char) => ({
		type: 'key',
		key: char === '.' ? 'decimal' : char === '<' ? 'backspace' : char,
		places,
	}));
const discount = (percent: number): PriceEntryAction => ({ type: 'discount', percent });

describe('priceEntryReducer', () => {
	it('takes any number of whole digits: a cashier is never stopped', () => {
		expect(run(...typed('12345678')).buffer).toBe('12345678');
		expect(run(...typed('12345678901', 0)).buffer).toBe('12345678901');
		expect(run(...typed('123456789.5', 1)).buffer).toBe('123456789.5');
	});

	it('a separator with no places leaves a lit discount lit', () => {
		expect(run(discount(10), ...typed('.', 0))).toEqual({ buffer: '', discount: 10 });
	});

	it('backspace to empty shows the stored price again', () => {
		const entry = run(...typed('12<<'));
		expect(entry).toEqual(EMPTY_PRICE);
		expect(draftPrice(entry, 3.2, 2)).toBeUndefined();
	});

	it('a quick key sets the discount and clears the typing; the same key again clears it', () => {
		const lit = run(...typed('7'), discount(10));
		expect(lit).toEqual({ buffer: '', discount: 10 });
		expect(priceEntryReducer(lit, discount(10))).toEqual(EMPTY_PRICE);
		expect(priceEntryReducer(lit, discount(5))).toEqual({ buffer: '', discount: 5 });
	});

	it('a digit after a quick key clears the discount and starts a fresh buffer', () => {
		expect(run(discount(10), ...typed('4'))).toEqual({ buffer: '4' });
		expect(run(discount(10), ...typed('<'))).toEqual(EMPTY_PRICE);
	});

	it('reset forgets everything', () => {
		expect(run(discount(10), { type: 'reset' })).toBe(EMPTY_PRICE);
	});
});

describe('draftPrice', () => {
	it('is what was typed, 0 included (a free line)', () => {
		expect(draftPrice({ buffer: '4.5' }, 3.2, 2)).toBe(4.5);
		expect(draftPrice({ buffer: '0' }, 3.2, 2)).toBe(0);
	});

	it("is the stored price less the discount, at the currency's places", () => {
		expect(draftPrice({ buffer: '', discount: 10 }, 3.2, 2)).toBe(2.88);
		expect(draftPrice({ buffer: '', discount: 15 }, 3.33, 2)).toBe(2.83);
		expect(draftPrice({ buffer: '', discount: 15 }, 3.33, 0)).toBe(3);
	});

	it('is nothing when nothing was typed or lit', () => {
		expect(draftPrice(EMPTY_PRICE, 3.2, 2)).toBeUndefined();
	});

	it('is nothing for a lone decimal press, but 0 typed is 0', () => {
		expect(draftPrice(run(...typed('.')), 3.2, 2)).toBeUndefined();
		expect(draftPrice(run(...typed('0')), 3.2, 2)).toBe(0);
		expect(draftPrice(run(...typed('0.5')), 3.2, 2)).toBe(0.5);
	});
});
