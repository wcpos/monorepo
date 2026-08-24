import { shippingTaxClassFromStore, taxClassFromWire, taxClassToWire } from './tax-class';

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
 * The store's shipping tax class carries one spelling the item classes do not:
 * WooCommerce's 'inherit' sentinel, which a fresh store defaults to. It matches no
 * tax rate, so a cart line authored with it gets no tax at all — see
 * add-shipping.tsx and the "seeds the tax class" cases in add-cart-lines.test.tsx.
 */
describe('shippingTaxClassFromStore', () => {
	it.each([
		['inherit', 'standard'],
		['', 'standard'],
		['standard', 'standard'],
		[null, 'standard'],
		[undefined, 'standard'],
		['reduced-rate', 'reduced-rate'],
		// Merchant-defined classes are selectable (see stores schema v14) and pass through.
		['luxury', 'luxury'],
	])('maps %p to %p', (value, expected) => {
		expect(shippingTaxClassFromStore(value)).toBe(expected);
	});

	it('resolves to a class the wire codec then spells as the standard class', () => {
		expect(taxClassToWire(shippingTaxClassFromStore('inherit'))).toBe('');
	});
});
