import { toSortableInteger, fromSortableInteger } from './utils';

describe('toSortableInteger', () => {
	describe('basic conversions', () => {
		it('should convert a simple decimal price', () => {
			expect(toSortableInteger('9.99')).toBe(9990000);
		});

		it('should convert a number directly', () => {
			expect(toSortableInteger(10.50)).toBe(10500000);
		});

		it('should convert an integer', () => {
			expect(toSortableInteger(100)).toBe(100000000);
		});

		it('should convert zero', () => {
			expect(toSortableInteger(0)).toBe(0);
			expect(toSortableInteger('0')).toBe(0);
		});

		it('should handle negative numbers', () => {
			expect(toSortableInteger(-9.99)).toBe(-9990000);
			expect(toSortableInteger('-10.50')).toBe(-10500000);
		});
	});

	describe('precision handling', () => {
		it('should preserve 6 decimal places', () => {
			expect(toSortableInteger('0.000001')).toBe(1);
			expect(toSortableInteger('0.123456')).toBe(123456);
		});

		it('should round values beyond 6 decimal places', () => {
			// 0.1234567 rounds to 0.123457
			expect(toSortableInteger('0.1234567')).toBe(123457);
			// 0.1234564 rounds to 0.123456
			expect(toSortableInteger('0.1234564')).toBe(123456);
		});

		it('should handle very small values', () => {
			expect(toSortableInteger('0.01')).toBe(10000);
			expect(toSortableInteger('0.001')).toBe(1000);
		});

		it('should handle very large values', () => {
			// $2,147.48 is the 32-bit limit for prices stored as integers * 1M
			expect(toSortableInteger('2147.48')).toBe(2147480000);
			// Larger values should still work with number type
			expect(toSortableInteger('10000.00')).toBe(10000000000);
		});
	});

	describe('edge cases and invalid inputs', () => {
		it('should return 0 for null', () => {
			expect(toSortableInteger(null)).toBe(0);
		});

		it('should return 0 for undefined', () => {
			expect(toSortableInteger(undefined)).toBe(0);
		});

		it('should return 0 for empty string', () => {
			expect(toSortableInteger('')).toBe(0);
		});

		it('should return 0 for non-numeric strings', () => {
			expect(toSortableInteger('invalid')).toBe(0);
			expect(toSortableInteger('abc')).toBe(0);
			expect(toSortableInteger('$9.99')).toBe(0); // Currency symbols
		});

		it('should return 0 for NaN', () => {
			expect(toSortableInteger(NaN)).toBe(0);
		});

		it('should return 0 for objects', () => {
			expect(toSortableInteger({})).toBe(0);
			expect(toSortableInteger({ price: 9.99 })).toBe(0);
		});

		it('should return 0 for arrays', () => {
			expect(toSortableInteger([])).toBe(0);
			expect(toSortableInteger([9.99])).toBe(9990000); // lodash toNumber converts [9.99] to 9.99
		});

		it('should handle boolean values', () => {
			expect(toSortableInteger(true)).toBe(1000000); // true becomes 1
			expect(toSortableInteger(false)).toBe(0); // false becomes 0
		});
	});

	describe('string format handling', () => {
		it('should handle strings with leading/trailing whitespace', () => {
			expect(toSortableInteger(' 9.99 ')).toBe(9990000);
			expect(toSortableInteger('\t10.50\n')).toBe(10500000);
		});

		it('should handle strings with leading zeros', () => {
			expect(toSortableInteger('009.99')).toBe(9990000);
			expect(toSortableInteger('00.50')).toBe(500000);
		});

		it('should handle scientific notation', () => {
			expect(toSortableInteger('1e2')).toBe(100000000); // 100
			expect(toSortableInteger('1.5e1')).toBe(15000000); // 15
		});
	});

	describe('real-world WooCommerce price scenarios', () => {
		it('should handle typical product prices', () => {
			expect(toSortableInteger('19.99')).toBe(19990000);
			expect(toSortableInteger('149.00')).toBe(149000000);
			expect(toSortableInteger('999.99')).toBe(999990000);
		});

		it('should handle prices with fewer decimal places', () => {
			expect(toSortableInteger('10')).toBe(10000000);
			expect(toSortableInteger('10.5')).toBe(10500000);
		});

		it('should handle the problematic 2137.3 value from bug report', () => {
			// This was a specific bug case where floating-point representation caused issues
			expect(toSortableInteger('2137.3')).toBe(2137300000);
			expect(toSortableInteger(2137.3)).toBe(2137300000);
		});
	});
});

describe('fromSortableInteger', () => {
	it('should convert back to original decimal', () => {
		expect(fromSortableInteger(9990000)).toBe(9.99);
		expect(fromSortableInteger(10500000)).toBe(10.5);
		expect(fromSortableInteger(100000000)).toBe(100);
	});

	it('should handle zero', () => {
		expect(fromSortableInteger(0)).toBe(0);
	});

	it('should handle negative values', () => {
		expect(fromSortableInteger(-9990000)).toBe(-9.99);
	});

	it('should be the inverse of toSortableInteger', () => {
		const testValues = [0, 9.99, 10.5, 100, 2137.3, 0.000001, -50.25];

		for (const value of testValues) {
			const sortable = toSortableInteger(value);
			const restored = fromSortableInteger(sortable);
			// Use toFixed to handle floating point precision
			expect(restored.toFixed(6)).toBe(value.toFixed(6));
		}
	});
});
