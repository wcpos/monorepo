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
