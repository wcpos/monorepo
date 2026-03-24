import {
	addNumberPrecision,
	getRoundingPrecision,
	removeNumberPrecision,
	roundDiscount,
	roundHalfDown,
	roundHalfUp,
	roundTaxTotal,
} from './precision';

describe('precision utilities', () => {
	describe('roundHalfUp', () => {
		it('rounds 2.725 to 2dp as 2.73 (standard midpoint rounding)', () => {
			expect(roundHalfUp(2.725, 2)).toBe(2.73);
		});

		it('rounds 2.724 to 2dp as 2.72', () => {
			expect(roundHalfUp(2.724, 2)).toBe(2.72);
		});

		it('rounds 2.726 to 2dp as 2.73', () => {
			expect(roundHalfUp(2.726, 2)).toBe(2.73);
		});

		it('rounds 1.005 to 2dp as 1.01', () => {
			expect(roundHalfUp(1.005, 2)).toBe(1.01);
		});

		it('rounds to 0 decimal places', () => {
			expect(roundHalfUp(2.5, 0)).toBe(3);
			expect(roundHalfUp(2.4, 0)).toBe(2);
		});

		it('handles negative numbers', () => {
			expect(roundHalfUp(-2.725, 2)).toBe(-2.72);
		});

		it('rounds to 4 decimal places', () => {
			expect(roundHalfUp(1.23456, 4)).toBe(1.2346);
		});
	});

	describe('roundHalfDown', () => {
		it('rounds 2.725 to 2dp as 2.72 (midpoint rounds down)', () => {
			expect(roundHalfDown(2.725, 2)).toBe(2.72);
		});

		it('rounds 2.726 to 2dp as 2.73 (above midpoint still rounds up)', () => {
			expect(roundHalfDown(2.726, 2)).toBe(2.73);
		});

		it('rounds 2.724 to 2dp as 2.72 (below midpoint rounds down)', () => {
			expect(roundHalfDown(2.724, 2)).toBe(2.72);
		});

		it('rounds 1.005 to 2dp as 1.0 (midpoint rounds down)', () => {
			expect(roundHalfDown(1.005, 2)).toBe(1);
		});

		it('rounds to 0 decimal places', () => {
			expect(roundHalfDown(2.5, 0)).toBe(2);
			expect(roundHalfDown(2.6, 0)).toBe(3);
			expect(roundHalfDown(2.4, 0)).toBe(2);
		});

		it('rounds 3.5 to 0dp as 3 (midpoint rounds down)', () => {
			expect(roundHalfDown(3.5, 0)).toBe(3);
		});

		it('handles negative numbers at midpoint', () => {
			expect(roundHalfDown(-2.725, 2)).toBe(-2.72);
		});
	});

	describe('getRoundingPrecision', () => {
		it('returns 6 for dp=2 (default WC config)', () => {
			expect(getRoundingPrecision(2)).toBe(6);
		});

		it('returns 6 for dp=0 (JPY)', () => {
			expect(getRoundingPrecision(0)).toBe(6);
		});

		it('returns 6 for dp=3', () => {
			expect(getRoundingPrecision(3)).toBe(6);
		});

		it('returns 6 for dp=4', () => {
			expect(getRoundingPrecision(4)).toBe(6);
		});

		it('returns 7 for dp=5', () => {
			expect(getRoundingPrecision(5)).toBe(7);
		});
	});

	describe('addNumberPrecision', () => {
		it('shifts 9.99 to cents with dp=2', () => {
			expect(addNumberPrecision(9.99, 2)).toBe(999);
		});

		it('shifts 10.00 to cents with dp=2', () => {
			expect(addNumberPrecision(10, 2)).toBe(1000);
		});

		it('shifts 0.5 to cents with dp=2', () => {
			expect(addNumberPrecision(0.5, 2)).toBe(50);
		});

		it('handles dp=0 (JPY)', () => {
			expect(addNumberPrecision(100, 0)).toBe(100);
		});

		it('handles dp=3', () => {
			expect(addNumberPrecision(9.999, 3)).toBe(9999);
		});

		it('rounds the result with round=true (default)', () => {
			// 1.005 * 100 = 100.49999... in IEEE754, but addNumberPrecision rounds to 4dp
			expect(addNumberPrecision(1.005, 2)).toBe(100.5);
		});

		it('with round=false uses full rounding precision', () => {
			expect(addNumberPrecision(9.99, 2, false)).toBe(999);
		});
	});

	describe('removeNumberPrecision', () => {
		it('shifts 999 back to 9.99 with dp=2', () => {
			expect(removeNumberPrecision(999, 2)).toBe(9.99);
		});

		it('shifts 1000 back to 10 with dp=2', () => {
			expect(removeNumberPrecision(1000, 2)).toBe(10);
		});

		it('handles dp=0', () => {
			expect(removeNumberPrecision(100, 0)).toBe(100);
		});

		it('handles dp=3', () => {
			expect(removeNumberPrecision(9999, 3)).toBe(9.999);
		});
	});

	describe('roundTaxTotal', () => {
		it('uses HALF_DOWN when pricesIncludeTax=true', () => {
			// 2.725 at midpoint -> rounds DOWN to 2.72
			expect(roundTaxTotal(2.725, 2, true)).toBe(2.72);
		});

		it('uses HALF_UP when pricesIncludeTax=false', () => {
			// 2.725 at midpoint -> rounds UP to 2.73
			expect(roundTaxTotal(2.725, 2, false)).toBe(2.73);
		});

		it('both modes agree when not at midpoint', () => {
			expect(roundTaxTotal(2.726, 2, true)).toBe(2.73);
			expect(roundTaxTotal(2.726, 2, false)).toBe(2.73);
			expect(roundTaxTotal(2.724, 2, true)).toBe(2.72);
			expect(roundTaxTotal(2.724, 2, false)).toBe(2.72);
		});

		it('respects precision override', () => {
			// 0dp precision for cent-level rounding
			expect(roundTaxTotal(2.5, 2, true, 0)).toBe(2);
			expect(roundTaxTotal(2.5, 2, false, 0)).toBe(3);
		});

		it('handles 0dp stores (JPY)', () => {
			expect(roundTaxTotal(2.5, 0, true)).toBe(2);
			expect(roundTaxTotal(2.5, 0, false)).toBe(3);
		});
	});

	describe('roundDiscount', () => {
		it('always uses HALF_DOWN', () => {
			expect(roundDiscount(2.725, 2)).toBe(2.72);
			expect(roundDiscount(2.726, 2)).toBe(2.73);
			expect(roundDiscount(2.724, 2)).toBe(2.72);
		});

		it('rounds to 0 precision (cent-level)', () => {
			expect(roundDiscount(2.5, 0)).toBe(2);
			expect(roundDiscount(2.6, 0)).toBe(3);
		});
	});
});
