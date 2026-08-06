/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useCartLines } from './use-cart-lines';

const appliedCouponReferenceDemand = jest.fn();
let whenSettled = jest.fn(async () => true);
let whenSettledInBackground = jest.fn(async (_signal: AbortSignal) => true);
let referenceGeneration = 0;

jest.mock('../../../../query', () => ({
	useAppliedCouponReferenceDemand: (enabled: boolean) => {
		appliedCouponReferenceDemand(enabled);
		return {
			whenSettled: () => whenSettled(),
			whenSettledInBackground: (signal: AbortSignal) => whenSettledInBackground(signal),
			generation: referenceGeneration,
		};
	},
}));

type CouponLine = { code: string | null };
type LineItem = { total: string; total_tax: string; product_id: number };

const lineItems$ = new BehaviorSubject<LineItem[]>([]);
const feeLines$ = new BehaviorSubject<unknown[]>([]);
const shippingLines$ = new BehaviorSubject<unknown[]>([]);
const couponLines$ = new BehaviorSubject<CouponLine[]>([]);

/**
 * The engine adapter wraps every order in a fresh Proxy, and `getLatest()` calls
 * `wrapEngineDocument(collection, rxDocument.getLatest())` — so it hands back a NEW object on
 * EVERY call, even when nothing changed (packages/query/src/engine-adapter/document-proxy.ts).
 * The fake has to behave the same way, or the tests pass against reference comparisons that can
 * never hold in production.
 */
let revision = buildRevision();

function buildRevision(overrides: Record<string, unknown> = {}) {
	return {
		uuid: 'order-uuid-1',
		status: 'pos-open',
		date_modified_gmt: '2026-08-06T00:00:00',
		line_items: lineItems$.getValue(),
		fee_lines: [],
		shipping_lines: [],
		coupon_lines: couponLines$.getValue(),
		...overrides,
	};
}

/** A brand-new object per call, exactly like the production proxy. */
const getLatest = () => ({ ...revision });

function editCart(lineItems: LineItem[]) {
	lineItems$.next(lineItems);
	revision = buildRevision({ date_modified_gmt: new Date().toISOString() });
}

function applyCoupon(couponLines: CouponLine[]) {
	couponLines$.next(couponLines);
	revision = buildRevision({ date_modified_gmt: new Date().toISOString() });
}

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: {
			line_items$: lineItems$,
			fee_lines$: feeLines$,
			shipping_lines$: shippingLines$,
			coupon_lines$: couponLines$,
			getLatest,
		},
	}),
}));

jest.mock('./use-fee-line-data', () => ({
	useFeeLineData: () => ({ getFeeLineData: () => ({ percent: false }) }),
}));

const recalculate = jest.fn(async (lineItems: LineItem[], couponLines: CouponLine[]) => ({
	lineItems,
	couponLines,
}));

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

type LocalPatchArgs = { document: unknown; data: Record<string, unknown> };
const localPatch = jest.fn(async (_args: LocalPatchArgs) => undefined);

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));

jest.mock('./calculate-order-totals', () => ({
	calculateOrderTotals: () => ({
		discount_tax: '0.00',
		discount_total: '5.00',
		shipping_tax: '0.00',
		shipping_total: '0.00',
		cart_tax: '0.00',
		total_tax: '0.00',
		total: '5.00',
		tax_lines: [],
	}),
}));

/** A deferred `whenSettledInBackground` the test resolves by hand. */
function deferredBackgroundWait() {
	let release: ((settled: boolean) => void) | undefined;
	const signals: AbortSignal[] = [];
	whenSettledInBackground = jest.fn(
		(signal: AbortSignal) =>
			new Promise<boolean>((resolve) => {
				signals.push(signal);
				release = resolve;
			})
	);
	return { settle: () => release?.(true), giveUp: () => release?.(false), signals };
}

describe('useCartLines reference demand (#952)', () => {
	beforeEach(() => {
		appliedCouponReferenceDemand.mockClear();
		recalculate.mockClear();
		localPatch.mockClear();
		whenSettled = jest.fn(async () => true);
		whenSettledInBackground = jest.fn(async (_signal: AbortSignal) => true);
		referenceGeneration = 0;
		couponLines$.next([]);
		lineItems$.next([]);
		revision = buildRevision();
	});

	it('declares no coupon reference demand for a cart without coupon lines', () => {
		renderHook(() => useCartLines());

		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(false);
		expect(appliedCouponReferenceDemand).not.toHaveBeenCalledWith(true);
	});

	it('declares coupon reference demand once the cart carries an applied coupon line', () => {
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		// Replay reads coupon + category residents directly, so the cart is the only
		// thing that can ask for them on a device that never opened the picker.
		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(true);
	});

	it('ignores removed coupon lines (code === null) when declaring demand', () => {
		applyCoupon([{ code: null }]);
		renderHook(() => useCartLines());

		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(false);
		expect(appliedCouponReferenceDemand).not.toHaveBeenCalledWith(true);
	});

	it('declares demand when a coupon is applied to an already-mounted cart', async () => {
		renderHook(() => useCartLines());
		expect(appliedCouponReferenceDemand).not.toHaveBeenCalledWith(true);

		await act(async () => {
			applyCoupon([{ code: 'bonus' }]);
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
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		// A cart edit while the on-demand pull is still in flight. Scanning now would hit the
		// still-empty coupons/categories collections — the exact race the barrier closes.
		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(whenSettled).toHaveBeenCalled();
		expect(recalculate).not.toHaveBeenCalled();

		await act(async () => {
			releaseReferences?.();
		});
		expect(recalculate).toHaveBeenCalled();
	});

	it('writes the replayed totals through localPatch when the references are ready', async () => {
		// Regression guard: the "has the order moved?" check used to compare `getLatest()` by
		// reference. The engine adapter mints a new proxy per call, so that comparison was
		// ALWAYS unequal and the replay bailed before every write — the totals never updated.
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(recalculate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0].data).toEqual(
			expect.objectContaining({ discount_total: '5.00', total: '5.00' })
		);
	});

	it('skips the foreground replay when the reference wait times out', async () => {
		// A deadline does not make unmaterialized residents trustworthy. Bailing leaves the
		// cart on its previous totals until the references actually land.
		whenSettled = jest.fn(async () => false);
		deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(whenSettled).toHaveBeenCalled();
		expect(recalculate).not.toHaveBeenCalled();
	});
});

describe('useCartLines background coupon replay (#963)', () => {
	beforeEach(() => {
		appliedCouponReferenceDemand.mockClear();
		recalculate.mockClear();
		localPatch.mockClear();
		// The scenario this issue is about: the reference pull outran the 10s barrier.
		whenSettled = jest.fn(async () => false);
		whenSettledInBackground = jest.fn(async (_signal: AbortSignal) => true);
		referenceGeneration = 0;
		couponLines$.next([]);
		lineItems$.next([]);
		revision = buildRevision();
	});

	it('replays the coupon once the references land after the foreground barrier expired', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		// Totals are stale at this point — that is the bug the continuation closes.
		expect(recalculate).not.toHaveBeenCalled();
		expect(background.signals).toHaveLength(1);

		await act(async () => {
			background.settle();
		});

		expect(recalculate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				document: expect.objectContaining({
					uuid: 'order-uuid-1',
					line_items: revision.line_items,
				}),
				data: expect.objectContaining({ discount_total: '5.00', total: '5.00' }),
			})
		);
	});

	it('arms exactly one continuation for the same order revision and demand generation', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		await act(async () => {
			// Same revision (price-decimals style re-run, not a new order): must not stack a
			// second wait on top of the one already running.
			lineItems$.next([{ total: '11.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(whenSettledInBackground).toHaveBeenCalledTimes(1);
		expect(background.signals).toHaveLength(1);
		expect(background.signals[0].aborted).toBe(false);
	});

	it('drops the stale continuation when the cart is edited during the background wait', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		const staleLineItems = revision.line_items;

		// A newer edit lands while the references are still in flight. Its own replay owns the
		// order from here — the older continuation must not write the pre-edit discounts back.
		whenSettled = jest.fn(async () => true);
		await act(async () => {
			editCart([{ total: '20.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(recalculate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				document: expect.objectContaining({ line_items: revision.line_items }),
			})
		);
		expect(background.signals[0].aborted).toBe(true);

		// The abandoned wait resolving late must be a no-op — no double-apply.
		await act(async () => {
			background.settle();
		});
		expect(recalculate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch).not.toHaveBeenCalledWith(
			expect.objectContaining({
				document: expect.objectContaining({ line_items: staleLineItems }),
			})
		);
	});

	it('does not replay into an order that checkout moved while the wait was running', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		// Checkout pushes the order and the server response lands back on the resident: the
		// lines are untouched but the order has moved on. Replaying the pre-push discounts now
		// would change the totals of an order that has already been submitted.
		revision = buildRevision({
			status: 'completed',
			date_modified_gmt: '2026-08-06T10:00:00',
		});

		await act(async () => {
			background.settle();
		});

		expect(recalculate).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('gives up silently when the background wait hits its cap, and the next edit still heals', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		await act(async () => {
			background.giveUp();
		});
		expect(recalculate).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();

		// The next cart edit remains the ultimate self-heal.
		whenSettled = jest.fn(async () => true);
		await act(async () => {
			editCart([{ total: '30.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(recalculate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
	});

	it('collapses a foreground replay that overlaps the continuation into a single write', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		renderHook(() => useCartLines());

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		// Hold the replay open so the two callers genuinely overlap rather than running in turn.
		let releaseRecalculate: (() => void) | undefined;
		recalculate.mockImplementationOnce(
			(lineItems: LineItem[], couponLines: CouponLine[]) =>
				new Promise((resolve) => {
					releaseRecalculate = () => resolve({ lineItems, couponLines });
				})
		);

		await act(async () => {
			background.settle();
		});
		expect(recalculate).toHaveBeenCalledTimes(1);
		expect(localPatch).not.toHaveBeenCalled();

		// A same-revision re-run of the cart subscription (the #222 price-decimals path) reaches
		// the replay while the continuation's recalculation is still in flight. Both hold the
		// SAME order revision, so single-flight has to collapse them into one write.
		whenSettled = jest.fn(async () => true);
		await act(async () => {
			lineItems$.next([{ total: '15.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(recalculate).toHaveBeenCalledTimes(1);

		await act(async () => {
			releaseRecalculate?.();
		});
		expect(localPatch).toHaveBeenCalledTimes(1);
	});
});
