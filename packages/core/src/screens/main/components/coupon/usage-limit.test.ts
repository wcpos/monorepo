/**
 * @jest-environment node
 *
 * Tests for the coupon usage-limit conversion helpers.
 */
import {
	fromUsageLimit,
	isOneTimeUse,
	NO_USAGE_LIMIT,
	ONE_TIME_USE,
	toggleOneTimeUse,
	toUsageLimit,
} from './usage-limit';

describe('toUsageLimit', () => {
	it('clears the limit with 0 rather than null when the field is emptied', () => {
		// A null here would be dropped by WC_REST_Coupons_Controller on update, leaving the
		// previous limit in place. 0 is the value WooCommerce reads as "no limit".
		expect(toUsageLimit('')).toBe(NO_USAGE_LIMIT);
		expect(toUsageLimit('')).toBe(0);
		expect(toUsageLimit('')).not.toBeNull();
	});

	it('treats a whitespace-only or non-numeric field as cleared', () => {
		expect(toUsageLimit('   ')).toBe(0);
		expect(toUsageLimit('abc')).toBe(0);
	});

	it('treats nullish input as cleared', () => {
		expect(toUsageLimit(null)).toBe(0);
		expect(toUsageLimit(undefined)).toBe(0);
	});

	it('parses digits into a number', () => {
		expect(toUsageLimit('1')).toBe(1);
		expect(toUsageLimit('100')).toBe(100);
		expect(toUsageLimit(25)).toBe(25);
	});

	it('strips non-digits so separators and signs never reach the API', () => {
		expect(toUsageLimit('1,000')).toBe(1000);
		expect(toUsageLimit('-5')).toBe(5);
		expect(toUsageLimit('2.5')).toBe(25);
	});

	it('always returns a number, never null', () => {
		for (const input of ['', '  ', 'abc', null, undefined, '7']) {
			expect(typeof toUsageLimit(input)).toBe('number');
		}
	});
});

describe('fromUsageLimit', () => {
	it('renders an unset limit as a blank field', () => {
		expect(fromUsageLimit(null)).toBe('');
		expect(fromUsageLimit(undefined)).toBe('');
	});

	it('renders the cleared sentinel as a blank field', () => {
		expect(fromUsageLimit(0)).toBe('');
	});

	it('renders a real limit as its digits', () => {
		expect(fromUsageLimit(1)).toBe('1');
		expect(fromUsageLimit(100)).toBe('100');
	});
});

describe('usage limit round trip', () => {
	it('clearing an existing limit produces a submittable clearing value', () => {
		const existing = 100;
		expect(fromUsageLimit(existing)).toBe('100');

		// User selects all and deletes.
		const submitted = toUsageLimit('');
		expect(submitted).toBe(0);

		// The cleared value renders back as blank, not "0".
		expect(fromUsageLimit(submitted)).toBe('');
	});

	it('preserves a typed limit through display and submit', () => {
		expect(fromUsageLimit(toUsageLimit('50'))).toBe('50');
	});
});

describe('one-time use mapping', () => {
	it('recognizes exactly usage_limit === 1 as one-time use', () => {
		expect(isOneTimeUse(1)).toBe(true);
		expect(isOneTimeUse(0)).toBe(false);
		expect(isOneTimeUse(2)).toBe(false);
		expect(isOneTimeUse(null)).toBe(false);
		expect(isOneTimeUse(undefined)).toBe(false);
	});

	it('toggling on writes 1; toggling off writes the clearing sentinel, not null', () => {
		expect(toggleOneTimeUse(true)).toBe(ONE_TIME_USE);
		expect(toggleOneTimeUse(false)).toBe(NO_USAGE_LIMIT);
		expect(toggleOneTimeUse(false)).not.toBeNull();
	});
});
