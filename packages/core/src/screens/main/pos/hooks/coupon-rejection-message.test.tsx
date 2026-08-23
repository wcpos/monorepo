/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import type { CouponRejection, CouponRejectionCode } from '@wcpos/order-math/internal';

import { useCouponRejectionMessage } from './coupon-rejection-message';

jest.mock('../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../jest/translate')>(
				'../../../../../jest/translate'
			)
			.createTestT(),
}));

jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));

/**
 * Every code the pure validator can emit. Kept as an explicit literal rather
 * than derived from the type, because the point of the coverage test below is
 * to fail when upstream adds a twelfth one — a list derived from the union
 * would grow silently and prove nothing.
 */
const ALL_CODES: CouponRejectionCode[] = [
	'already_applied',
	'expired',
	'usage_limit_reached',
	'usage_limit_reached_for_customer',
	'minimum_spend_not_met',
	'maximum_spend_exceeded',
	'individual_use',
	'individual_use_conflict',
	'email_required',
	'email_not_allowed',
	'not_applicable_to_cart',
];

const renderMessage = () => renderHook(() => useCouponRejectionMessage()).result.current;

describe('useCouponRejectionMessage', () => {
	/**
	 * The regression this file exists for. Coupon rejections used to be flattened
	 * to hardcoded English by `coupon-rejection-strings.ts` and rendered beside
	 * translated copy, and `en/core.json` had no key for any of the 11 reasons
	 * (#1472). `createTestT` falls through to the key itself when nothing
	 * resolves, so an unkeyed code shows up here as a raw `pos_cart.` string.
	 */
	it.each(ALL_CODES)('renders %s as translated copy, not a key or a code', (code) => {
		const message = renderMessage()({ code, params: { amount: '50', code: 'solo' } });

		expect(message).not.toMatch(/^pos_cart\./);
		expect(message).not.toBe(code);
		expect(message.length).toBeGreaterThan(0);
	});

	it('covers every code the validator can emit', () => {
		// Guards the list above against drifting from the union it stands in for.
		const codes = new Set(ALL_CODES);
		expect(codes.size).toBe(ALL_CODES.length);
		expect(ALL_CODES).toHaveLength(11);
	});

	it('formats a minimum spend in the store currency', () => {
		// The old English rendered the bare decimal — "Minimum spend of 50.00 not
		// met" — an amount in no particular currency on a till that knows which one
		// it takes.
		const message = renderMessage()({
			code: 'minimum_spend_not_met',
			params: { amount: '50' },
		});

		expect(message).toBe('This coupon needs a minimum spend of $50.00.');
	});

	it('formats a maximum spend in the store currency', () => {
		const message = renderMessage()({
			code: 'maximum_spend_exceeded',
			params: { amount: '250' },
		});

		expect(message).toBe('This coupon only applies to orders under $250.00.');
	});

	/**
	 * The two individual-use codes point at DIFFERENT coupons, and getting them
	 * the same way round is the whole value of the message.
	 */
	it('names the coupon being added when it is the individual-use one', () => {
		const message = renderMessage()({ code: 'individual_use', params: { code: 'solo' } });

		expect(message).toBe("solo can't be combined with other coupons. Remove the others to use it.");
	});

	it('names the coupon already applied when that one is individual-use', () => {
		const message = renderMessage()({
			code: 'individual_use_conflict',
			params: { code: 'members-only' },
		});

		expect(message).toBe(
			"members-only is already on the order, and it can't be combined with other coupons."
		);
	});

	it('survives a rejection that arrives without params', () => {
		// params is optional on the type; an interpolating message must not render
		// a stray `{code}` at a cashier if upstream ever omits it.
		const message = renderMessage()({ code: 'individual_use' } as CouponRejection);

		expect(message).not.toContain('{code}');
	});

	it('speaks about the customer, not the reader', () => {
		// This is a till: the person reading is the cashier and the person the
		// coupon is restricted to is the customer in front of them. The pre-move
		// English said "your email address", which addressed the wrong person.
		const message = renderMessage()({ code: 'email_not_allowed' });

		expect(message).toContain('customer');
		expect(message).not.toMatch(/\byour\b/i);
	});
});
