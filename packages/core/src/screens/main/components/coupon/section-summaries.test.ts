/**
 * @jest-environment node
 */
import {
	hasRestrictions,
	hasUsageLimits,
	restrictionsSummary,
	usageLimitsSummary,
} from './section-summaries';

// Stub t: returns the key, with any interpolation values appended, so each
// assertion shows exactly which key was used and what was passed to it.
const t = (key: string, options?: Record<string, unknown>) =>
	options ? `${key}:${Object.values(options).join(',')}` : key;
const formatAmount = (amount: string) => `$${amount}`;

describe('restrictionsSummary', () => {
	it('returns the none key when nothing is set', () => {
		expect(restrictionsSummary({}, t, formatAmount)).toBe('coupons.none');
		expect(
			restrictionsSummary(
				{ minimum_amount: '', maximum_amount: '', individual_use: false, free_shipping: false },
				t,
				formatAmount
			)
		).toBe('coupons.none');
	});

	it('joins the set restrictions with a middot', () => {
		expect(
			restrictionsSummary({ minimum_amount: '10', individual_use: true }, t, formatAmount)
		).toBe('coupons.min_summary:$10 · coupons.cannot_be_combined');
	});
});

describe('usageLimitsSummary', () => {
	it('returns the unlimited key when nothing is set (null, 0, undefined all mean unlimited)', () => {
		expect(usageLimitsSummary({}, t)).toBe('coupons.unlimited');
		expect(usageLimitsSummary({ usage_limit: 0, usage_limit_per_user: null }, t)).toBe(
			'coupons.unlimited'
		);
	});

	it('lists the set limits', () => {
		expect(usageLimitsSummary({ usage_limit: 1, usage_limit_per_user: 2 }, t)).toBe(
			'coupons.total_uses_summary:1 · coupons.per_customer_summary:2'
		);
	});
});

describe('has* helpers', () => {
	it('hasRestrictions is true when any restriction is set', () => {
		expect(hasRestrictions({})).toBe(false);
		expect(hasRestrictions({ minimum_amount: '5' })).toBe(true);
		expect(hasRestrictions({ free_shipping: true })).toBe(true);
	});

	it('hasUsageLimits treats 0/null/undefined as unset', () => {
		expect(hasUsageLimits({ usage_limit: 0 })).toBe(false);
		expect(hasUsageLimits({ usage_limit: null })).toBe(false);
		expect(hasUsageLimits({ limit_usage_to_x_items: 3 })).toBe(true);
	});
});
