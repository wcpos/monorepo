/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { useCartSettlement } from './use-cart-settlement';

const MONEY_PATCH = {
	discount_tax: '0.00',
	discount_total: '5.00',
	shipping_tax: '0.00',
	shipping_total: '0.00',
	cart_tax: '0.00',
	total_tax: '0.00',
	total: '5.00',
	tax_lines: [] as unknown[],
};

/**
 * Pass 2 — the coupon replay. `settleCart` now runs ONLY for a cart with active
 * coupon lines, and per SPEC §4 a patch from a run whose replay fired always
 * carries `line_items` and `coupon_lines`. The mock mirrors that, because those
 * keys are how a test tells a replay write apart from a money write.
 */
const successfulSettlement = () => ({
	ok: true as const,
	changed: true,
	patch: {
		...MONEY_PATCH,
		line_items: lineItems$.value,
		coupon_lines: couponLines$.value,
	},
	totals: {},
	warnings: [],
});
const settleCart: jest.MockedFunction<
	(snapshot: unknown, config: unknown, options?: unknown) => unknown
> = jest.fn((_snapshot: unknown, _config: unknown, _options?: unknown) => successfulSettlement());

/**
 * Pass 1 — the money over the persisted lines. Separate from `settleCart`
 * because the two are reached differently and that difference is the point: the
 * aggregate must land with no await in front of it, while the coupon replay
 * waits for reference data. It has no `ok` discriminant; it cannot fail, and it
 * never emits lines.
 */
const successfulAggregate = () => ({
	changed: true,
	patch: { ...MONEY_PATCH },
	totals: {},
	warnings: [],
});
const settleAggregate: jest.MockedFunction<(snapshot: unknown, config: unknown) => unknown> =
	jest.fn((_snapshot: unknown, _config: unknown) => successfulAggregate());

/**
 * A couponed edit produces TWO writes, and nearly every assertion below cares
 * about one of them. The prompt money pass writes the aggregate alone; the
 * coupon replay writes the redistributed lines with it.
 */
const replayWrites = () => localPatch.mock.calls.filter(([args]) => 'coupon_lines' in args.data);
const moneyWrites = () => localPatch.mock.calls.filter(([args]) => !('coupon_lines' in args.data));
const createCartConfig = jest.fn((config: Record<string, unknown>) => config);

jest.mock('@wcpos/order-math', () => ({
	createCartConfig: (config: Record<string, unknown>) => createCartConfig(config),
	settleCart: (snapshot: unknown, config: unknown, options?: unknown) =>
		settleCart(snapshot, config, options),
	settleAggregate: (snapshot: unknown, config: unknown) => settleAggregate(snapshot, config),
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

const emptyCouponContext = () => ({
	coupons: new Map(),
	productCategories: new Map(),
	categoryParents: new Map(),
});
const getCouponContext: jest.MockedFunction<
	(lineItems: LineItem[]) => Promise<ReturnType<typeof emptyCouponContext>>
> = jest.fn(async (_lineItems: LineItem[]) => emptyCouponContext());

let divergenceValue: { serverTotal: string } | null = null;

jest.mock('../contexts/order-money-divergence', () => ({
	useOrderMoneyDivergence: () => ({
		divergence: divergenceValue,
		serverOwnsMoney: divergenceValue !== null,
		divergedOrderCount: divergenceValue === null ? 0 : 1,
	}),
}));

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
	settleAggregate.mockClear();
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
		settleAggregate.mockClear();
		settleAggregate.mockImplementation(() => successfulAggregate());
		getCouponContext.mockClear();
		feeLineIsPercent = false;
		divergenceValue = null;
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

	/**
	 * The mount pass is new behaviour (#1472 removed skip(1)), and it is what fixes a
	 * new order keeping the PREVIOUS order's money: adding the first item converts a
	 * temporary order into a persisted one, and the cart mounts with that line already
	 * present, so there is no later edit to trigger settlement.
	 *
	 * It must not write when there is nothing to correct, or every cart open would
	 * enqueue a server update. settle's own `changed` flag is what decides.
	 */
	it('settles on mount and writes when the persisted totals are stale', async () => {
		renderHook(() => useCartSettlement());
		await act(async () => {});

		expect(settleAggregate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
	});

	it('settles on mount but writes nothing when the persisted totals are already right', async () => {
		settleAggregate.mockImplementation(() => ({ ...successfulAggregate(), changed: false }));

		renderHook(() => useCartSettlement());
		await act(async () => {});

		expect(settleAggregate).toHaveBeenCalledTimes(1);
		expect(localPatch).not.toHaveBeenCalled();
	});

	/**
	 * THE regression this split exists for (e2e/pos-coupon-apply.spec.ts — "applies a
	 * percent coupon through the cart and the server records the same money").
	 *
	 * The cutover routed the money write through `settleCart`, which cannot run
	 * without a CouponContext. On a couponed cart that put the aggregate behind
	 * `whenCouponReferencesSettled()` and an async context fetch — and the cashier
	 * saves within a second of applying the coupon, so the sale went to the server
	 * with `discount_total: 0`.
	 *
	 * The money is now derived from the lines as persisted. It must land while the
	 * barrier is still unresolved; that is the property, not a latency preference.
	 */
	it('writes the money before the coupon barrier resolves', async () => {
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		// A barrier that never settles at all: whatever reaches the document does so
		// without its help.
		whenSettled = jest.fn(() => new Promise<boolean>(() => {}));
		settleAggregate.mockImplementation(() => ({
			...successfulAggregate(),
			patch: { ...successfulAggregate().patch, discount_total: '2.23' },
		}));

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0].data).toEqual(
			expect.objectContaining({ discount_total: '2.23' })
		);
		// And it did not need the coupon records to get there.
		expect(getCouponContext).not.toHaveBeenCalled();
	});

	it('does not ask for a coupon context to settle the money', async () => {
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(settleAggregate).toHaveBeenCalledTimes(1);
		expect(settleAggregate.mock.calls[0]).toHaveLength(2);
	});

	/**
	 * ADR 0032. WooCommerce owns money — the aggregate fields are read-only in its
	 * REST schema — so once the server has overruled this order's arithmetic the POS
	 * stops deriving it. Both passes stand down, not just the money one: a coupon
	 * replay rewrites line-level `total`/`total_tax`, which is the same claim by
	 * another route.
	 *
	 * This replaces the re-push guard, the overruled-money latch and the suppression
	 * rule, all deleted. Three attempts to state that rule correctly were wrong; the
	 * question it asked — "may I assert my number again?" — is not asked any more.
	 */
	it('stops settling altogether once the server owns this order’s money', async () => {
		divergenceValue = { serverTotal: '9.99' };
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(localPatch).not.toHaveBeenCalled();
		expect(settleAggregate).not.toHaveBeenCalled();
		expect(settleCart).not.toHaveBeenCalled();
	});

	it('does not even reach for the coupon references on a diverged order', async () => {
		divergenceValue = { serverTotal: '9.99' };
		applyCoupon([{ code: 'bonus' }]);
		await renderAfterMountSettle();
		whenSettled.mockClear();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(whenSettled).not.toHaveBeenCalled();
		expect(getCouponContext).not.toHaveBeenCalled();
	});

	/**
	 * A divergence arriving mid-flight used to need a place in the single-flight key,
	 * so the in-flight pass could not carry on believing nothing had diverged. There
	 * is no such key input now — the hook stands down at the top of the next pass —
	 * so what matters is that the divergence stops the NEXT settlement rather than
	 * racing the current one.
	 */
	it('stands down on the next pass after a divergence arrives', async () => {
		applyCoupon([{ code: 'bonus' }]);
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			divergenceValue = { serverTotal: '9.99' };
			rerender();
		});
		settleAggregate.mockClear();
		localPatch.mockClear();

		await act(async () => {
			editCart([{ total: '10.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(settleAggregate).not.toHaveBeenCalled();
		expect(localPatch).not.toHaveBeenCalled();
	});

	it('persists totals through settleAggregate when the cart has no coupon lines', async () => {
		await renderAfterMountSettle();

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(whenSettled).not.toHaveBeenCalled();
		expect(settleCart).not.toHaveBeenCalled();
		expect(settleAggregate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0].data).toEqual(
			expect.objectContaining({ discount_total: '5.00', total: '5.00' })
		);
	});

	/**
	 * A coupon the device cannot resolve fails the REPLAY, and the cashier hears
	 * about it. The money still settles: the aggregate reads the discount already
	 * distributed across the persisted lines, so it has nothing to be missing.
	 * Withholding it would leave the cart showing a total the document does not
	 * hold — the exact failure this split fixes, arriving by a different door.
	 */
	it('shows a translated toast when settleCart reports a missing coupon, but still settles the money', async () => {
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

		expect(mockCartWarn).toHaveBeenCalledWith(
			'Cart settlement failed',
			expect.objectContaining({
				showToast: true,
				toast: expect.objectContaining({ title: 'Coupon not found' }),
			})
		);
		// The aggregate wrote; the failed replay wrote nothing on top of it.
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0].data).not.toHaveProperty('line_items');
	});

	/**
	 * Percent fees used to be recomputed by a loop calling updateFeeLine() once per
	 * fee line, each of which wrote. They now ride the settle patch instead.
	 *
	 * Asserting `updateFeeLine` was NOT called would be vacuous — this hook does not
	 * import it, so that expectation cannot fail. The real behaviour is that the
	 * recomputed fee lines reach the document through the single settle write.
	 */
	it('carries recomputed percentage fee lines in the single settle write', async () => {
		feeLineIsPercent = true;
		feeLines$.next([{ name: '10% service', meta_data: [] }]);
		await renderAfterMountSettle();
		// A percent fee's basis is the persisted lines, so the aggregate pass owns it —
		// no coupon data needed, and no reason for it to wait behind any.
		settleAggregate.mockImplementation(() => ({
			...successfulAggregate(),
			patch: {
				...successfulAggregate().patch,
				fee_lines: [{ name: '10% service', total: '0.50' }],
			},
		}));

		await act(async () => {
			editCart([{ total: '5.00', total_tax: '0.00', product_id: 1 }]);
		});

		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0].data).toEqual(
			expect.objectContaining({ fee_lines: [{ name: '10% service', total: '0.50' }] })
		);
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
		// The money first, then the redistributed lines — in that order, because the
		// money is what a save half a second later has to find on the document.
		expect(moneyWrites()).toHaveLength(1);
		expect(replayWrites()).toHaveLength(1);
		expect(localPatch.mock.calls[0][0].data).not.toHaveProperty('coupon_lines');
		expect(replayWrites()[0][0].data).toEqual(
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

			// The REPLAY is what must not land — it was computed against the pre-mutation
			// order. The money pass legitimately wrote against that same document a
			// moment earlier: the aggregate it derived was correct for the lines that
			// were there, and the mutation brings a fresh pass round for the new ones.
			expect(localPatch).not.toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ coupon_lines: expect.anything() }),
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
		settleAggregate.mockClear();
		settleAggregate.mockImplementation(() => successfulAggregate());
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
		// The continuation carries the REPLAY. The money had already landed when the
		// edit happened, which is why the totals were only ever stale in their coupon
		// DISTRIBUTION, not absent.
		expect(replayWrites()).toHaveLength(1);
		expect(replayWrites()[0][0]).toEqual(
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
		expect(replayWrites()[0][0].document).toBe(currentOrderRecord.getLatest());
		expect(replayWrites()[0][0].document._readSeq).toBe(seqWhenArmed);
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

	/**
	 * The mount pass gives a newly-opened order its initial settlement, but switching
	 * tabs is NOT a remount — setCurrentOrderID swaps the context value in place. The
	 * trigger compares serialized inputs, so two orders whose carts serialize the same
	 * (two empty ones, most obviously) would emit nothing and the order switched TO
	 * would keep whatever stale aggregate money it had.
	 */
	it('settles an order switched to whose cart serializes identically', async () => {
		const { rerender } = await renderAfterMountSettle();

		await act(async () => {
			// Same cart contents, different order.
			currentOrderRecord = buildCurrentOrderRecord('order-uuid-2');
			revision = buildRevision({ uuid: 'order-uuid-2' });
			rerender();
		});

		expect(settleAggregate).toHaveBeenCalledTimes(1);
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(localPatch.mock.calls[0][0].document.uuid).toBe('order-uuid-2');
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

		localPatch.mockClear();

		await act(async () => {
			background.settle();
		});

		/**
		 * Asserted on the TARGET rather than on call counts. The order switched to
		 * settles on arrival and arms its own continuation, and this deferred releases
		 * both — so counting calls now measures the new order's legitimate work. What
		 * must hold is that nothing lands on the order the cashier navigated away from.
		 */
		expect(localPatch.mock.calls.every((call) => call[0].document.uuid !== 'order-uuid-1')).toBe(
			true
		);
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
		expect(replayWrites()).toHaveLength(1);
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
		// One money write per edit — both were correct for the lines in front of them —
		// and exactly one replay, belonging to the newer edit.
		expect(moneyWrites()).toHaveLength(2);
		expect(replayWrites()).toHaveLength(1);
		expect(replayWrites()[0][0]).toEqual(
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
		expect(replayWrites()).toHaveLength(1);
		expect(localPatch).not.toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ coupon_lines: expect.anything() }),
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
		expect(replayWrites()).toHaveLength(0);
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
		expect(replayWrites()).toHaveLength(0);
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
		expect(replayWrites()).toHaveLength(0);
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
		expect(replayWrites()).toHaveLength(1);
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
		expect(replayWrites()).toHaveLength(0);

		/**
		 * A same-revision re-render (the #222 price-decimals path) reaches the replay
		 * while the continuation's recalculation is still in flight.
		 *
		 * This used to assert that single-flight COLLAPSED the two, on the grounds that
		 * both hold the same order revision. That was wrong, and #1472 changes it: the
		 * order revision is identical but the CONFIGURATION is not, and collapsing meant
		 * the new decimals were never applied until the cashier happened to touch a line
		 * — defeating the point of #222, which put priceNumDecimals in the trigger in the
		 * first place. Single-flight is now keyed on the revision AND the config, so a
		 * configuration change starts its own pass.
		 */
		whenSettled = jest.fn(async () => true);
		await act(async () => {
			priceNumDecimals = 3;
			rerender();
		});
		expect(getCouponContext).toHaveBeenCalledTimes(2);

		await act(async () => {
			releaseContext?.();
		});
		// Both passes run, but only the NEWER one writes: the older pass resumes after
		// it, finds itself superseded, and abandons rather than overwriting the lines
		// with the stale configuration. Still exactly one replay write.
		expect(replayWrites()).toHaveLength(1);
	});
});
