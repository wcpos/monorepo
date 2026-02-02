import {
	limitToScale,
	toNumericString,
	getThousandsGroupRegex,
	applyThousandSeparator,
	splitDecimal,
	roundToPrecision,
} from './format-number.helpers';

describe('format-number helpers', () => {
	describe('limitToScale', () => {
		it('should limit decimal digits to given scale', () => {
			expect(limitToScale('12345', 3, false)).toBe('123');
		});

		it('should pad with zeros when fixedDecimalScale is true', () => {
			expect(limitToScale('1', 4, true)).toBe('1000');
		});

		it('should not pad when fixedDecimalScale is false', () => {
			expect(limitToScale('1', 4, false)).toBe('1');
		});

		it('should handle empty string', () => {
			expect(limitToScale('', 3, true)).toBe('000');
			expect(limitToScale('', 3, false)).toBe('');
		});
	});

	describe('toNumericString', () => {
		it('should convert regular numbers', () => {
			expect(toNumericString(123)).toBe('123');
			expect(toNumericString(-456)).toBe('-456');
		});

		it('should handle numbers with no exponent', () => {
			expect(toNumericString(1.5)).toBe('1.5');
		});

		it('should handle very small numbers (negative exponent)', () => {
			const result = toNumericString(1e-7);
			expect(result).toBe('0.0000001');
		});

		it('should handle very large numbers (positive exponent)', () => {
			const result = toNumericString(1e7);
			expect(result).toBe('10000000');
		});

		it('should handle negative numbers with exponent', () => {
			const result = toNumericString(-1e-7);
			expect(result).toBe('-0.0000001');
		});
	});

	describe('getThousandsGroupRegex', () => {
		it('should return thousand grouping regex by default', () => {
			const regex = getThousandsGroupRegex('thousand');
			expect('1234567'.replace(regex, '$1,')).toBe('1,234,567');
		});

		it('should return lakh grouping regex', () => {
			const regex = getThousandsGroupRegex('lakh');
			expect(regex).toBeInstanceOf(RegExp);
		});

		it('should return wan grouping regex', () => {
			const regex = getThousandsGroupRegex('wan');
			expect(regex).toBeInstanceOf(RegExp);
		});
	});

	describe('applyThousandSeparator', () => {
		it('should apply comma separator for thousands', () => {
			expect(applyThousandSeparator('1234567', ',', 'thousand')).toBe('1,234,567');
		});

		it('should apply dot separator', () => {
			expect(applyThousandSeparator('1234567', '.', 'thousand')).toBe('1.234.567');
		});

		it('should handle small numbers', () => {
			expect(applyThousandSeparator('123', ',', 'thousand')).toBe('123');
		});

		it('should handle leading zeros', () => {
			expect(applyThousandSeparator('001234', ',', 'thousand')).toBe('001,234');
		});
	});

	describe('splitDecimal', () => {
		it('should split a positive decimal number', () => {
			const result = splitDecimal('123.45');
			expect(result.beforeDecimal).toBe('123');
			expect(result.afterDecimal).toBe('45');
			expect(result.hasNagation).toBe(false);
			expect(result.addNegation).toBe(false);
		});

		it('should split a negative decimal number', () => {
			const result = splitDecimal('-123.45');
			expect(result.beforeDecimal).toBe('123');
			expect(result.afterDecimal).toBe('45');
			expect(result.hasNagation).toBe(true);
			expect(result.addNegation).toBe(true);
		});

		it('should handle integer without decimal', () => {
			const result = splitDecimal('456');
			expect(result.beforeDecimal).toBe('456');
			expect(result.afterDecimal).toBe('');
		});

		it('should respect allowNegative=false', () => {
			const result = splitDecimal('-123.45', false);
			expect(result.hasNagation).toBe(true);
			expect(result.addNegation).toBe(false);
		});
	});

	describe('roundToPrecision', () => {
		it('should round to given precision', () => {
			expect(roundToPrecision('1.2345', 2, false)).toBe('1.23');
		});

		it('should handle fixed decimal scale', () => {
			expect(roundToPrecision('1.2', 4, true)).toBe('1.2');
		});

		it('should return empty/dash strings unchanged', () => {
			expect(roundToPrecision('', 2, false)).toBe('');
			expect(roundToPrecision('-', 2, false)).toBe('-');
		});

		it('should handle negative numbers', () => {
			expect(roundToPrecision('-1.2345', 2, false)).toBe('-1.23');
		});

		it('should handle number with no decimal', () => {
			expect(roundToPrecision('123', 2, false)).toBe('123');
		});

		it('should handle rounding up', () => {
			expect(roundToPrecision('1.999', 2, false)).toBe('2.00');
		});
	});
});
