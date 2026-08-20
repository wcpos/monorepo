import { normalizeTaxClass, STANDARD_TAX_CLASS } from './tax-class';

describe('normalizeTaxClass', () => {
	it("maps the wire spelling '' to 'standard'", () => {
		expect(normalizeTaxClass('')).toBe(STANDARD_TAX_CLASS);
	});

	it("maps nullish to 'standard'", () => {
		expect(normalizeTaxClass(null)).toBe(STANDARD_TAX_CLASS);
		expect(normalizeTaxClass(undefined)).toBe(STANDARD_TAX_CLASS);
	});

	it("passes 'standard' through unchanged", () => {
		expect(normalizeTaxClass('standard')).toBe('standard');
	});

	it('passes non-standard classes through unchanged', () => {
		expect(normalizeTaxClass('reduced-rate')).toBe('reduced-rate');
		expect(normalizeTaxClass('zero-rate')).toBe('zero-rate');
	});
});
