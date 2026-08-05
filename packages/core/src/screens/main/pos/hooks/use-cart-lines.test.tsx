/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useCartLines } from './use-cart-lines';

const appliedCouponReferenceDemand = jest.fn();
let whenSettled = jest.fn(async () => true);

jest.mock('../../../../query', () => ({
	useAppliedCouponReferenceDemand: (enabled: boolean) => {
		appliedCouponReferenceDemand(enabled);
		return { whenSettled: () => whenSettled() };
	},
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
			getLatest: () => ({
				line_items: lineItems$.getValue(),
				fee_lines: [],
				shipping_lines: [],
				coupon_lines: couponLines$.getValue(),
			}),
		},
	}),
}));

jest.mock('./use-fee-line-data', () => ({
	useFeeLineData: () => ({ getFeeLineData: () => ({ percent: false }) }),
}));

const recalculate = jest.fn(async () => undefined);

jest.mock('./use-recalculate-coupons', () => ({
	useRecalculateCoupons: () => ({ recalculate }),
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
		recalculate.mockClear();
		whenSettled = jest.fn(async () => true);
		couponLines$.next([]);
		lineItems$.next([]);
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

	it('declares demand when a coupon is applied to an already-mounted cart', async () => {
		renderHook(() => useCartLines());
		expect(appliedCouponReferenceDemand).not.toHaveBeenCalledWith(true);

		await act(async () => {
			couponLines$.next([{ code: 'bonus' }]);
		});

		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(true);
	});

	it('holds the coupon replay until the reference pull it declared has settled', async () => {
		let releaseReferences: (() => void) | undefined;
		whenSettled = jest.fn(
			() =>
				new Promise<boolean>((resolve) => {
					releaseReferences = () => resolve(true);
				})
		);
		couponLines$.next([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		// A cart edit while the on-demand pull is still in flight. Scanning now would hit the
		// still-empty coupons/categories collections — the exact race the barrier closes.
		await act(async () => {
			lineItems$.next([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(whenSettled).toHaveBeenCalled();
		expect(recalculate).not.toHaveBeenCalled();

		await act(async () => {
			releaseReferences?.();
		});
		expect(recalculate).toHaveBeenCalled();
	});

	it('skips the replay entirely when the reference wait times out', async () => {
		// A deadline does not make unmaterialized residents trustworthy. Bailing leaves the
		// cart on its previous totals; the next edit re-runs the replay.
		whenSettled = jest.fn(async () => false);
		couponLines$.next([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			lineItems$.next([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(whenSettled).toHaveBeenCalled();
		expect(recalculate).not.toHaveBeenCalled();
	});
});
