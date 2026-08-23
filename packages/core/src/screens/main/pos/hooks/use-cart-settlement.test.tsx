/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { useCartSettlement } from './use-cart-settlement';

const successfulSettlement = () => ({
	ok: true as const,
	changed: true,
	patch: {
		discount_tax: '0.00',
		discount_total: '5.00',
		shipping_tax: '0.00',
		shipping_total: '0.00',
		cart_tax: '0.00',
		total_tax: '0.00',
		total: '5.00',
		tax_lines: [],
	},
	totals: {},
	warnings: [],
});
const settleCart: jest.MockedFunction<
	(snapshot: unknown, config: unknown, options?: unknown) => unknown
> = jest.fn((_snapshot: unknown, _config: unknown, _options?: unknown) => successfulSettlement());
const createCartConfig = jest.fn((config: Record<string, unknown>) => config);

jest.mock('@wcpos/order-math', () => ({
	createCartConfig: (config: Record<string, unknown>) => createCartConfig(config),
	settleCart: (snapshot: unknown, config: unknown, options?: unknown) =>
		settleCart(snapshot, config, options),
	snapshotFromOrderJSON: (payload: Record<string, unknown>) => payload,
}));

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useDocField: (
		_store: unknown,
		selector: (value: {
			woocommerce_calc_discounts_sequentially: string;
			calc_discounts_sequentially: string;
		}) => unknown
	) =>
		selector({
			woocommerce_calc_discounts_sequentially: 'no',
			calc_discounts_sequentially: 'no',
		}),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));

const appliedCouponReferenceDemand = jest.fn();
let whenSettled = jest.fn(async () => true);
let whenSettledInBackground = jest.fn(async (_signal: AbortSignal) => true);
let referenceGeneration = 0;

const mockCartWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: (...args: unknown[]) => mockCartWarn(...args),
		error: jest.fn(),
		success: jest.fn(),
	}),
}));
jest.mock('../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../jest/translate')>(
		'../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

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

let revision = buildRevision();

function buildRevision(overrides: Record<string, unknown> = {}) {
	return {
		uuid: 'order-uuid-1',
		// A POS cart has no Woo id until checkout pushes it and the create-ack grafts one on.
		id: null as number | null,
		status: 'pos-open',
		date_modified_gmt: '2026-08-06T00:00:00',
		line_items: lineItems$.getValue(),
		fee_lines: [],
		shipping_lines: [],
		coupon_lines: couponLines$.getValue(),
		...overrides,
	};
}

let readSeq = 0;

function currentPayload() {
	return {
		...revision,
		line_items: lineItems$.value,
		fee_lines: feeLines$.value,
		shipping_lines: shippingLines$.value,
		coupon_lines: couponLines$.value,
	};
}

type TestOrderRecord = {
	uuid: string;
	payload: ReturnType<typeof currentPayload>;
	_readSeq: number;
	toMutableJSON: () => {
		uuid: string;
		payload: ReturnType<typeof currentPayload>;
	};
};

let latestRecord: TestOrderRecord | undefined;
let latestState: unknown[] | undefined;

function getLatest(): TestOrderRecord {
	const state = [
		revision,
		lineItems$.value,
		feeLines$.value,
		shippingLines$.value,
		couponLines$.value,
	];
	if (latestRecord && latestState?.every((value, index) => value === state[index])) {
		return latestRecord;
	}
	const payload = currentPayload();
	latestState = state;
	latestRecord = {
		uuid: String(payload.uuid),
		payload,
		_readSeq: ++readSeq,
		toMutableJSON: () => ({ uuid: payload.uuid, payload }),
	};
	return latestRecord;
}

/**
 * A raw record-shaped current-order fixture. Its `$` stream follows the four cart arrays and
 * `getLatest()` retains identity until one of those resident values changes.
 */
const buildCurrentOrderRecord = (uuid = 'order-uuid-1') => ({
	uuid,
	payload: currentPayload(),
	$: combineLatest([lineItems$, feeLines$, shippingLines$, couponLines$]).pipe(
		map(() => ({ toJSON: () => ({ uuid, payload: currentPayload() }) }))
	),
	collection: { name: 'orders' },
	getLatest,
});

let currentOrderRecord = buildCurrentOrderRecord();

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
		currentOrderRecord,
	}),
}));

jest.mock('./use-fee-line-data', () => ({
	useFeeLineData: () => ({
		getFeeLineData: () => ({ percent: feeLineIsPercent }),
	}),
}));

let feeLineIsPercent = false;

jest.mock('./use-update-fee-line', () => ({
	useUpdateFeeLine: () => ({ updateFeeLine }),
}));

const updateFeeLine = jest.fn(async () => undefined);

const emptyCouponContext = () => ({
	coupons: new Map(),
	productCategories: new Map(),
	categoryParents: new Map(),
});
const getCouponContext: jest.MockedFunction<
	(lineItems: LineItem[]) => Promise<ReturnType<typeof emptyCouponContext>>
> = jest.fn(async (_lineItems: LineItem[]) => emptyCouponContext());

jest.mock('./use-coupon-context', () => ({
	useCouponContext: () => ({ getCouponContext }),
}));

let allRates: unknown[] = [];
let taxRoundAtSubtotal = false;
let priceNumDecimals = 2;
let pricesIncludeTax = false;

jest.mock('../../contexts/tax-rates', () => ({
	useTaxLocation: () => ({ rates: [] }),
	useTaxSettings: () => ({
		allRates,
		shippingTaxClass: '',
		calcTaxes: true,
		taxRoundAtSubtotal,
		priceNumDecimals,
		pricesIncludeTax,
	}),
}));

type LocalPatchArgs = {
	document: { uuid?: string; _readSeq?: number };
	data: Record<string, unknown>;
};
const localPatch = jest.fn(async (_args: LocalPatchArgs) => undefined);

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));

/** A deferred `whenSettledInBackground` the test resolves by hand. */
/**
 * Shared so the mount-settle helper below can drop the continuation the MOUNT pass
 * arms, leaving `signals[0]` meaning what it meant before #1472: the wait belonging
 * to the edit under test. Cleared in place — tests hold a reference to this array.
 */
const backgroundSignals: AbortSignal[] = [];

function deferredBackgroundWait() {
	let release: ((settled: boolean) => void) | undefined;
	backgroundSignals.length = 0;
	const signals = backgroundSignals;
	whenSettledInBackground = jest.fn(
		(signal: AbortSignal) =>
			new Promise<boolean>((resolve) => {
				signals.push(signal);
				release = resolve;
			})
	);
	return {
		settle: () => release?.(true),
		giveUp: () => release?.(false),
		signals,
	};
}

/**
 * Render the writer and let its MOUNT settlement pass complete, then clear the spies.
 *
 * Settlement no longer skips the first emission (#1472): the cart as mounted is a real
 * settlement, because adding the first item converts a temporary order into a persisted
 * one and OpenOrders mounts this hook with that line already present. In production the
 * mount pass writes only when the persisted totals are actually stale — settle's own
 * `changed` flag sees to that — but the mock here always reports `changed: true`, so
 * every count would otherwise carry a "+1 for the mount" that hides what each test is
 * really about.
 */
async function renderAfterMountSettle() {
	const rendered = renderHook(() => useCartSettlement());
	await act(async () => {});
	settleCart.mockClear();
	localPatch.mockClear();
	getCouponContext.mockClear();
	whenSettledInBackground.mockClear?.();
	// A couponed cart mounting with a deferred barrier arms its own continuation. The
	// edit under test supersedes it, so drop it here rather than making every
	// assertion index past it.
	backgroundSignals.length = 0;
	return rendered;
}

describe('useCartSettlement reference demand (#952)', () => {
	beforeEach(() => {
		appliedCouponReferenceDemand.mockClear();
		createCartConfig.mockClear();
		localPatch.mockClear();
		settleCart.mockClear();
		settleCart.mockImplementation(() => successfulSettlement());
		getCouponContext.mockClear();
		updateFeeLine.mockClear();
		feeLineIsPercent = false;
		whenSettled = jest.fn(async () => true);
		whenSettledInBackground = jest.fn(async (_signal: AbortSignal) => true);
		referenceGeneration = 0;
		allRates = [];
		taxRoundAtSubtotal = false;
		priceNumDecimals = 2;
		pricesIncludeTax = false;
		couponLines$.next([]);
		lineItems$.next([]);
		feeLines$.next([]);
		shippingLines$.next([]);
		revision = buildRevision();
		currentOrderRecord = buildCurrentOrderRecord();
	});

	it('declares no coupon reference demand for a cart without coupon lines', async () => {
		await renderAfterMountSettle();

		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(false);
		expect(appliedCouponReferenceDemand).not.toHaveBeenCalledWith(true);
	});

	it('persists totals through settleCart when the cart has no coupon lines', async () => {
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(whenSettled).not.toHaveBeenCalled();
		expect(settleCart).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0].data).toEqual(
			expect.objectContaining({ discount_total: '5.00', total: '5.00' })
		);
	});

	it('shows a translated toast and writes nothing when settleCart reports a missing coupon', async () => {
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();
		// Queued AFTER the mount pass, which would otherwise consume the `once`.
		settleCart.mockReturnValueOnce({
			ok: false,
			error: { code: 'missing_coupon', missingCodes: ['bonus'] },
			warnings: [],
		});
		mockCartWarn.mockClear();

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(localPatch).not.toHaveBeenCalled();
		expect(mockCartWarn).toHaveBeenCalledWith(
			'Cart settlement failed',
			expect.objectContaining({
				showToast: true,
				toast: expect.objectContaining({ title: 'Coupon not found' }),
			})
		);
	});

	it('does not fan out automatic writes for percentage fee lines', async () => {
		feeLineIsPercent = true;
		feeLines$.next([{ name: '10% service', meta_data: [] }]);
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(updateFeeLine).not.toHaveBeenCalled();
	});

	it('declares coupon reference demand once the cart carries an applied coupon line', async () => {
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		// Replay reads coupon + category residents directly, so the cart is the only
		// thing that can ask for them on a device that never opened the picker.
		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(true);
	});

	it('ignores removed coupon lines (code === null) when declaring demand', async () => {
		applyCoupon([{ code: null }]);
		await renderAfterMountSettle();

		expect(appliedCouponReferenceDemand).toHaveBeenCalledWith(false);
		expect(appliedCouponReferenceDemand).not.toHaveBeenCalledWith(true);
	});

	it('declares demand when a coupon is applied to an already-mounted cart', async () => {
		await renderAfterMountSettle();
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
		await renderAfterMountSettle();

		// A cart edit while the on-demand pull is still in flight. Scanning now would hit the
		// still-empty coupons/categories collections — the exact race the barrier closes.
		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(whenSettled).toHaveBeenCalled();
		expect(getCouponContext).not.toHaveBeenCalled();

		await act(async () => {
			releaseReferences?.();
		});
		expect(getCouponContext).toHaveBeenCalled();
	});

	it('writes the replayed totals through localPatch when the references are ready', async () => {
		// Regression guard: the value guard must allow an unchanged resident through to the write.
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(getCouponContext).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0].data).toEqual(
			expect.objectContaining({ discount_total: '5.00', total: '5.00' })
		);
	});

	it.each(['fee_lines', 'shipping_lines'] as const)(
		'drops a foreground replay after a same-second %s mutation',
		async (field) => {
			let releaseContext: (() => void) | undefined;
			applyCoupon([{ code: 'bonus' }]);
			await renderAfterMountSettle();
			// Queued AFTER the mount pass, which would otherwise consume the `once` and
			// let the edit's replay resolve immediately — defeating the point of holding
			// it open across the same-second mutation below.
			getCouponContext.mockImplementationOnce(
				(_lineItems: LineItem[]) =>
					new Promise((resolve) => {
						releaseContext = () => resolve(emptyCouponContext());
					})
			);

			await act(async () => {
				editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
			});
			expect(getCouponContext).toHaveBeenCalledTimes(1);

			// Local mutations stamp whole seconds. Replace only the totals input while preserving
			// the captured timestamp and every other replay-identity field.
			const changedLines =
				field === 'fee_lines'
					? [{ name: 'Handling', total: '3.00' }]
					: [{ method_id: 'flat_rate', total: '4.00' }];
			revision = {
				...revision,
				[field]: changedLines,
			};
			await act(async () => {
				if (field === 'fee_lines') feeLines$.next(changedLines);
				else shippingLines$.next(changedLines);
				releaseContext?.();
			});

			expect(localPatch).not.toHaveBeenCalledWith(
				expect.objectContaining({
					document: expect.objectContaining({
						payload: expect.objectContaining({ [field]: [] }),
					}),
				})
			);
		}
	);

	it('skips the foreground replay when the reference wait times out', async () => {
		// A deadline does not make unmaterialized residents trustworthy. Bailing leaves the
		// cart on its previous totals until the references actually land.
		whenSettled = jest.fn(async () => false);
		deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(whenSettled).toHaveBeenCalled();
		expect(getCouponContext).not.toHaveBeenCalled();
	});
});

describe('useCartSettlement background coupon replay (#963)', () => {
	beforeEach(() => {
		appliedCouponReferenceDemand.mockClear();
		createCartConfig.mockClear();
		localPatch.mockClear();
		settleCart.mockClear();
		settleCart.mockImplementation(() => successfulSettlement());
		getCouponContext.mockClear();
		getCouponContext.mockImplementation(async (_lineItems: LineItem[]) => emptyCouponContext());
		// The scenario this issue is about: the reference pull outran the 10s barrier.
		whenSettled = jest.fn(async () => false);
		whenSettledInBackground = jest.fn(async (_signal: AbortSignal) => true);
		referenceGeneration = 0;
		couponLines$.next([]);
		lineItems$.next([]);
		feeLines$.next([]);
		shippingLines$.next([]);
		allRates = [];
		taxRoundAtSubtotal = false;
		priceNumDecimals = 2;
		pricesIncludeTax = false;
		revision = buildRevision();
		currentOrderRecord = buildCurrentOrderRecord();
	});

	/**
	 * Regression guard for the trigger, not the arithmetic.
	 *
	 * Before #1472 the use-order-totals effect re-derived totals every render and
	 * deep-compared them, so any settlement-config change — the customer's address
	 * moving the tax location, prices-include-tax flipping, rounding changing — wrote
	 * the new money by itself. After the cutover this subscription is the ONLY thing
	 * that persists totals, so every input createCartConfig reads has to be able to
	 * trigger it. Listing only the cart lines left the PERSISTED document stale while
	 * the on-screen totals looked correct.
	 */
	it('settles when the tax rates change without any cart line changing', async () => {
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		localPatch.mockClear();

		await act(async () => {
			// No cart line moves — only the tax location's rates.
			allRates = [
				{ id: 1, name: 'VAT', rate: '20', compound: false, order: 1, class: 'standard' },
			] as typeof allRates;
			rerender();
		});

		expect(localPatch).toHaveBeenCalledTimes(1);
	});

	it('replays the coupon once the references land after the foreground barrier expired', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		// Totals are stale at this point — that is the bug the continuation closes.
		expect(getCouponContext).not.toHaveBeenCalled();
		expect(background.signals).toHaveLength(1);
		const seqWhenArmed = readSeq;

		await act(async () => {
			background.settle();
		});

		expect(getCouponContext).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				document: expect.objectContaining({
					uuid: 'order-uuid-1',
					payload: expect.objectContaining({ line_items: revision.line_items }),
				}),
				data: expect.objectContaining({
					discount_total: '5.00',
					total: '5.00',
				}),
			})
		);
		// The raw record is identity-stable, so the fresh read resolves to the same resident handle.
		expect(localPatch.mock.calls[0][0].document).toBe(currentOrderRecord.getLatest());
		expect(localPatch.mock.calls[0][0].document._readSeq).toBe(seqWhenArmed);
	});

	it('arms exactly one continuation for the same order revision and demand generation', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		await act(async () => {
			// Same resident revision, different calculation context: must not stack a second wait.
			priceNumDecimals = 3;
			rerender();
		});

		expect(whenSettledInBackground).toHaveBeenCalledTimes(1);
		expect(background.signals).toHaveLength(1);
		expect(background.signals[0].aborted).toBe(false);
	});

	it('uses the latest calculation callback when the same continuation is armed again', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		await act(async () => {
			priceNumDecimals = 3;
			rerender();
		});
		expect(whenSettledInBackground).toHaveBeenCalledTimes(1);

		await act(async () => {
			background.settle();
		});

		expect(createCartConfig).toHaveBeenCalledWith(expect.objectContaining({ dp: 3 }));
	});

	it('uses current tax settings when they change without re-arming the continuation', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		const currentRates = [{ id: 7 }];
		await act(async () => {
			allRates = currentRates;
			taxRoundAtSubtotal = true;
			pricesIncludeTax = true;
			rerender();
		});
		expect(whenSettledInBackground).toHaveBeenCalledTimes(1);

		await act(async () => {
			background.settle();
		});

		expect(createCartConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				allRates: currentRates,
				taxRoundAtSubtotal: true,
				pricesIncludeTax: true,
			})
		);
	});

	it('aborts the continuation when the cart switches to another current order', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(background.signals[0].aborted).toBe(false);

		// A different order now owns the cart surface (setCurrentOrderID swaps the context
		// value without a remount), so the wait for the previous one must be abandoned.
		await act(async () => {
			currentOrderRecord = buildCurrentOrderRecord('order-uuid-2');
			revision = buildRevision({ uuid: 'order-uuid-2' });
			rerender();
		});
		expect(background.signals[0].aborted).toBe(true);

		await act(async () => {
			background.settle();
		});
		expect(getCouponContext).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('survives a current-order re-emission that did not change which order is open', async () => {
		// The open-orders query re-emits — and rebuilds every proxy — whenever ANY `pos-open`
		// order is written, which during a slow reference pull is routine background sync. Tying
		// the continuation's lifetime to the context OBJECT would abandon the replay for exactly
		// the reason it was armed. Identity is the uuid, not the wrapper.
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(background.signals[0].aborted).toBe(false);

		await act(async () => {
			currentOrderRecord = buildCurrentOrderRecord();
			rerender();
		});
		expect(background.signals[0].aborted).toBe(false);

		await act(async () => {
			background.settle();
		});
		expect(getCouponContext).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
	});

	it('drops the stale continuation when the cart is edited during the background wait', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

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
		expect(getCouponContext).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				document: expect.objectContaining({
					payload: expect.objectContaining({ line_items: revision.line_items }),
				}),
			})
		);
		expect(background.signals[0].aborted).toBe(true);

		// The abandoned wait resolving late must be a no-op — no double-apply.
		await act(async () => {
			background.settle();
		});
		expect(getCouponContext).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch).not.toHaveBeenCalledWith(
			expect.objectContaining({
				document: expect.objectContaining({
					payload: expect.objectContaining({ line_items: staleLineItems }),
				}),
			})
		);
	});

	it('does not replay into an order that checkout moved while the wait was running', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		// Checkout completed: only the status moved — same lines, same timestamp, no Woo id.
		// Replaying the pre-checkout discounts now would change the totals of an order that has
		// already been submitted.
		revision = buildRevision({ status: 'completed' });

		await act(async () => {
			background.settle();
		});

		expect(getCouponContext).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('does not replay after a checkout push grafted the Woo id onto the order', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		// Pay pushes the cart. The create-ack grafts the server's order id onto a resident that
		// had none — status is still `pos-open`, the lines are untouched, and the timestamp is
		// preserved, so the remote id is the ONLY thing that can reject this replay.
		revision = { ...revision, id: 4711 };

		await act(async () => {
			background.settle();
		});

		expect(getCouponContext).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('warns the cashier when the background wait hits its cap, and the next edit still heals', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});
		await act(async () => {
			background.giveUp();
		});
		expect(getCouponContext).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
		// Not silent anymore: the cashier is told the shown totals may be stale
		// (cashier-full-information ruling, 2026-08-07).
		expect(mockCartWarn).toHaveBeenCalledWith(
			'Coupon reference refresh timed out',
			expect.objectContaining({
				showToast: true,
				toast: expect.objectContaining({
					title: expect.stringContaining('out of date'),
				}),
			})
		);

		// The next cart edit remains the ultimate self-heal.
		whenSettled = jest.fn(async () => true);
		await act(async () => {
			editCart([{ total: '30.00', total_tax: '0.00', product_id: 1 }]);
		});
		expect(getCouponContext).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
	});

	it('collapses a foreground replay that overlaps the continuation into a single write', async () => {
		const background = deferredBackgroundWait();
		applyCoupon([{ code: 'bonus' }]);
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		// Hold the replay open so the two callers genuinely overlap rather than running in turn.
		let releaseContext: (() => void) | undefined;
		getCouponContext.mockImplementationOnce(
			(_lineItems: LineItem[]) =>
				new Promise((resolve) => {
					releaseContext = () => resolve(emptyCouponContext());
				})
		);

		await act(async () => {
			background.settle();
		});
		expect(getCouponContext).toHaveBeenCalledTimes(1);
		expect(localPatch).not.toHaveBeenCalled();

		// A same-revision re-render (the #222 price-decimals path) reaches
		// the replay while the continuation's recalculation is still in flight. Both hold the
		// SAME order revision, so single-flight has to collapse them into one write.
		whenSettled = jest.fn(async () => true);
		await act(async () => {
			priceNumDecimals = 3;
			rerender();
		});
		expect(getCouponContext).toHaveBeenCalledTimes(1);

		await act(async () => {
			releaseContext?.();
		});
		expect(localPatch).toHaveBeenCalledTimes(1);
	});
});
