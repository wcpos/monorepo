import { INHERIT_TAX_CLASS, taxClassFromWire, taxClassToWire } from './tax-class';

describe('taxClassFromWire', () => {
	it.each([
		['', 'standard'],
		['standard', 'standard'],
		[null, 'standard'],
		[undefined, 'standard'],
		['reduced-rate', 'reduced-rate'],
	])('maps %p to %p', (value, expected) => {
		expect(taxClassFromWire(value)).toBe(expected);
	});
});

describe('taxClassToWire', () => {
	it.each([
		['', ''],
		['standard', ''],
		[null, ''],
		[undefined, ''],
		['reduced-rate', 'reduced-rate'],
	])('maps %p to %p', (value, expected) => {
		expect(taxClassToWire(value)).toBe(expected);
	});
});

describe('tax class codec round trips', () => {
	it.each([
		['standard', 'standard'],
		['', 'standard'],
		['reduced-rate', 'reduced-rate'],
		[null, 'standard'],
		[undefined, 'standard'],
	])('normalizes %p to the internal value %p', (value, expected) => {
		expect(taxClassFromWire(taxClassToWire(value))).toBe(expected);
	});

	it.each([
		['standard', ''],
		['', ''],
		['reduced-rate', 'reduced-rate'],
		[null, ''],
		[undefined, ''],
	])('stabilizes %p to the wire value %p', (value, expected) => {
		expect(taxClassToWire(taxClassFromWire(value))).toBe(expected);
	});
});

/**
 * The 'inherit' sentinel must survive the codec untouched in BOTH directions: it is not
 * a spelling of the standard class, and `@wcpos/order-math` resolves it against the
 * order's line items. Collapsing it here would silently charge standard-rate shipping
 * tax on a cart WooCommerce taxes at another class.
 */
describe('the inherit sentinel round-trips', () => {
	it('survives the read side', () => {
		expect(taxClassFromWire(INHERIT_TAX_CLASS)).toBe(INHERIT_TAX_CLASS);
	});

	it('survives the write side', () => {
		expect(taxClassToWire(INHERIT_TAX_CLASS)).toBe(INHERIT_TAX_CLASS);
	});

	it('is distinct from every spelling of the standard class', () => {
		expect(INHERIT_TAX_CLASS).not.toBe(taxClassFromWire(''));
		expect(INHERIT_TAX_CLASS).not.toBe(taxClassToWire('standard'));
	});
});
