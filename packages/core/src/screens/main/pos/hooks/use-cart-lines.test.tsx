/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useCartLines } from './use-cart-lines';

const appliedCouponReferenceDemand = jest.fn();

jest.mock('../../../../query', () => ({
	useAppliedCouponReferenceDemand: (enabled: boolean) => appliedCouponReferenceDemand(enabled),
}));

type CouponLine = { code: string | null };

const lineItems$ = new BehaviorSubject<unknown[]>([]);
const feeLines$ = new BehaviorSubject<unknown[]>([]);
const shippingLines$ = new BehaviorSubject<unknown[]>([]);
const couponLines$ = new BehaviorSubject<CouponLine[]>([]);

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: {
			line_items$: lineItems$,
			fee_lines$: feeLines$,
			shipping_lines$: shippingLines$,
			coupon_lines$: couponLines$,
			getLatest: () => ({ line_items: [], fee_lines: [], shipping_lines: [], coupon_lines: [] }),
		},
	}),
}));

jest.mock('./use-fee-line-data', () => ({
	useFeeLineData: () => ({ getFeeLineData: () => ({ percent: false }) }),
}));

jest.mock('./use-recalculate-coupons', () => ({
	useRecalculateCoupons: () => ({ recalculate: jest.fn() }),
}));

jest.mock('./use-update-fee-line', () => ({
	useUpdateFeeLine: () => ({ updateFeeLine: jest.fn() }),
}));

jest.mock('../../contexts/tax-rates', () => ({
	useTaxRates: () => ({
		allRates: [],
		taxRoundAtSubtotal: false,
		priceNumDecimals: 2,
		pricesIncludeTax: false,
	}),
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: jest.fn() }),
}));

describe('useCartLines reference demand (#952)', () => {
	beforeEach(() => {
		appliedCouponReferenceDemand.mockClear();
		couponLines$.next([]);
	});

	it('declares no coupon reference demand for a cart without coupon lines', () => {
		renderHook(() => useCartLines());

		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(false);
		expect(appliedCouponReferenceDemand).not.toHaveBeenCalledWith(true);
	});

	it('declares coupon reference demand once the cart carries an applied coupon line', () => {
		couponLines$.next([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		// Replay reads coupon + category residents directly, so the cart is the only
		// thing that can ask for them on a device that never opened the picker.
		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(true);
	});

	it('ignores removed coupon lines (code === null) when declaring demand', () => {
		couponLines$.next([{ code: null }]);
		renderHook(() => useCartLines());

		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(false);
		expect(appliedCouponReferenceDemand).not.toHaveBeenCalledWith(true);
	});
});
