import { taxClassFromWire, taxClassToWire } from './tax-class';

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
