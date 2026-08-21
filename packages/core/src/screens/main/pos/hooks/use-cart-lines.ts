import * as React from 'react';

import { useObservable, useSubscription } from 'observable-hooks';
import { distinctUntilChanged, map, skip } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { useRecordField } from '@wcpos/query';

import { useAppliedCouponReferenceDemand } from '../../../../query';
import { calculateOrderTotals } from './calculate-order-totals';
import { useFeeLineData } from './use-fee-line-data';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useUpdateFeeLine } from './use-update-fee-line';
import { getUuidFromLineItem } from './utils';
import { useTaxSettings } from '../../contexts/tax-rates';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order';
import { useT } from '../../../../contexts/translations';

type OrderDocument = import('@wcpos/database').OrderDocument;
type FeeLine = NonNullable<OrderDocument['fee_lines']>[number];

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'lines']);

/**
 * Which order STATE a replay was computed for.
 *
 * The record face makes `getLatest()` identity-stable. Stage I2 nevertheless keeps this value
 * guard unchanged so retiring a money-path concurrency check remains a separate reviewed change.
 *
 * `id`, `status` and `date_modified_gmt` are in the key on purpose, not just the lines the
 * replay reads: ANY write to the order moves one of them — a newer cart edit, a status
 * transition out of `pos-open`, or a checkout push (the ack adopts the server payload, and a
 * create-ack grafts the Woo id onto an order that had none). A replay computed before such a
 * write must never land on top of it.
 */
// stage-I2 note: replayStateKey retirable now that getLatest() is identity-stable — kept pending review
function replayStateKey(order: CurrentOrderRecord): string {
	return JSON.stringify([
		order.uuid ?? null,
		order.payload.id ?? null,
		order.payload.status ?? null,
		order.payload.date_modified_gmt ?? null,
		order.payload.line_items ?? [],
		order.payload.fee_lines ?? [],
		order.payload.shipping_lines ?? [],
		order.payload.coupon_lines ?? [],
	]);
}

/** The only status a POS cart is editable in — see use-open-orders-resource / use-new-order. */
const POS_OPEN_STATUS = 'pos-open';

/**
 * The off-critical-path coupon replay armed when the foreground reference barrier expires (#963).
 *
 * Identity is (order state, reference-demand generation): re-arming for the same pair is a
 * no-op, and any other pair supersedes — the newer cart edit owns the replay from then on.
 */
type ReplayContinuation = {
	stateKey: string;
	generation: number;
	abort: AbortController;
	replay: (order: CurrentOrderRecord) => Promise<void>;
};

/**
 * @NOTE - when current order is updated, eg: date_modified, the cart lines will re-subscribe.
 */
export const useCartLines = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const lineItems = useRecordField(currentOrderRecord, (order) => order.payload.line_items);
	const feeLines = useRecordField(currentOrderRecord, (order) => order.payload.fee_lines);
	const shippingLines = useRecordField(currentOrderRecord, (order) => order.payload.shipping_lines);
	const couponLines = useRecordField(currentOrderRecord, (order) => order.payload.coupon_lines);
	const { getFeeLineData } = useFeeLineData();
	const { updateFeeLine } = useUpdateFeeLine();
	const { localPatch } = useLocalMutation();
	const { recalculate } = useRecalculateCoupons();
	const { allRates, taxRoundAtSubtotal, priceNumDecimals, pricesIncludeTax } = useTaxSettings();
	const t = useT();

	/**
	 * We need to filter out any items that have been 'removed', eg: product_id === null.
	 */
	const cartLines = React.useMemo(() => {
		return {
			line_items: (lineItems || []).filter((item) => item.product_id !== null),
			fee_lines: (feeLines || []).filter((item) => item.name !== null),
			shipping_lines: (shippingLines || []).filter((item) => item.method_id !== null),
			coupon_lines: (couponLines || []).filter((item) => item.code != null),
		};
	}, [lineItems, feeLines, shippingLines, couponLines]);

	/**
	 * Coupon replay below scans the resident coupons/categories collections directly, which
	 * declares no demand of its own. Since reference lanes fetch on demand (#952), a cart
	 * carrying coupon lines has to declare that demand itself or the replay throws on a
	 * device that never opened the coupon picker.
	 */
	const {
		whenSettled: whenCouponReferencesSettled,
		whenSettledInBackground: whenCouponReferencesSettledInBackground,
		generation: couponReferenceGeneration,
	} = useAppliedCouponReferenceDemand(cartLines.coupon_lines.length > 0);

	// Continuation + single-flight state. Refs, not state: nothing renders off them, and a
	// re-render must not disarm a wait that is still legitimate.
	const continuationRef = React.useRef<ReplayContinuation | null>(null);
	const replayingRef = React.useRef<string | null>(null);

	/**
	 * If line items change, and we have a percentage fee line, we need to recalculate the fee line total.
	 * Also triggers coupon replay when priceNumDecimals changes (issue #222).
	 *
	 * @TODO - this is a bit hacky, we should probably have a better way to handle this.
	 */
	const cartTotal$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				skip(1),
				map(([items, dp]) => {
					const totals = (items || []).reduce(
						(acc, item) => {
							acc.cart_total += parseFloat(item.total ?? '0');
							acc.cart_total_tax += parseFloat(item.total_tax ?? '0');
							return acc;
						},
						{ cart_total: 0, cart_total_tax: 0 }
					);
					return { ...totals, dp };
				}),
				distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next))
				// @TODO - this gets triggered twice, because if fee updates, line items will be a new array.
			),
		[lineItems, priceNumDecimals]
	);

	/**
	 * The coupon replay write, extracted so the background continuation reaches the order
	 * through the SAME path a cart edit does — same recalculation, same identity guards, same
	 * `localPatch`. The continuation only changes WHEN this runs, never how.
	 *
	 * Replays are single-flight per order revision: a settle signal that lands at the same
	 * moment as a cart edit must not apply the same recalculation twice.
	 */
	const replayCoupons = React.useCallback(
		async (freshOrder: CurrentOrderRecord) => {
			const stateKey = replayStateKey(freshOrder);
			if (replayingRef.current === stateKey) return;
			replayingRef.current = stateKey;
			try {
				// Replay coupon discounts via recalculateCoupons() which handles:
				// - POS price as coupon base (via _woocommerce_pos_data meta)
				// - lineIndex-based allocation for duplicate product_id lines
				// - Per-item capping to prevent over-allocation when stacking coupons
				// - Sequential discount mode
				// - Correct tax-inclusive/exclusive rounding
				const result = await recalculate(
					freshOrder.payload.line_items || [],
					freshOrder.payload.coupon_lines || []
				);
				if (!result) return; // coupon missing locally — bail to avoid partial data
				// Bail if the order moved during the async replay — a concurrent cart edit, a
				// checkout push, or a status change — rather than overwriting it.
				if (replayStateKey(currentOrderRecord.getLatest()) !== stateKey) return;

				// Compute order totals from the coupon-adjusted line items in the same
				// tick. This prevents useOrderTotals from running with stale pre-coupon
				// line items and flashing incorrect tax values.
				const totals = calculateOrderTotals({
					lineItems: result.lineItems.filter((item) => item.product_id !== null),
					feeLines: (freshOrder.payload.fee_lines || []).filter((item) => item.name !== null),
					shippingLines: (freshOrder.payload.shipping_lines || []).filter(
						(item) => item.method_id !== null
					),
					couponLines: result.couponLines.filter((item) => item.code != null),
					taxRates: allRates,
					taxRoundAtSubtotal,
					dp: priceNumDecimals,
					pricesIncludeTax,
				});

				await localPatch({
					document: freshOrder,
					data: {
						coupon_lines: result.couponLines,
						line_items: result.lineItems,
						discount_tax: totals.discount_tax,
						discount_total: totals.discount_total,
						shipping_tax: totals.shipping_tax,
						shipping_total: totals.shipping_total,
						cart_tax: totals.cart_tax,
						total_tax: totals.total_tax,
						total: totals.total,
						tax_lines: totals.tax_lines as NonNullable<OrderDocument['tax_lines']>,
					},
				});
			} finally {
				if (replayingRef.current === stateKey) replayingRef.current = null;
			}
		},
		[
			allRates,
			currentOrderRecord,
			localPatch,
			priceNumDecimals,
			pricesIncludeTax,
			recalculate,
			taxRoundAtSubtotal,
		]
	);

	// The background wait is external to React, so a tax-setting change does not re-arm it.
	// Keep an already-armed continuation on the calculation context from the latest render.
	React.useEffect(() => {
		if (continuationRef.current) continuationRef.current.replay = replayCoupons;
	}, [replayCoupons]);

	const disarmReplayContinuation = React.useCallback(() => {
		continuationRef.current?.abort.abort();
		continuationRef.current = null;
	}, []);

	/**
	 * Arm the off-critical-path continuation for a foreground barrier that expired (#963).
	 *
	 * Only the cart surface calls this, and `useCartLines` lives only there, so exactly one tab
	 * — the one holding the cart — ever waits. Idempotent per (order state, demand generation):
	 * re-arming for the same pair keeps the existing wait and refreshes its calculation context;
	 * any other pair aborts it because the newer edit's own replay now owns the order.
	 */
	const armReplayContinuation = React.useCallback(
		(freshOrder: CurrentOrderRecord) => {
			const stateKey = replayStateKey(freshOrder);
			const armed = continuationRef.current;
			if (
				armed &&
				armed.stateKey === stateKey &&
				armed.generation === couponReferenceGeneration &&
				!armed.abort.signal.aborted
			) {
				armed.replay = replayCoupons;
				return;
			}
			disarmReplayContinuation();
			const continuation: ReplayContinuation = {
				stateKey,
				generation: couponReferenceGeneration,
				abort: new AbortController(),
				replay: replayCoupons,
			};
			continuationRef.current = continuation;
			void (async () => {
				const settled = await whenCouponReferencesSettledInBackground(continuation.abort.signal);
				// Superseded (or unmounted) while waiting: the continuation that replaced this
				// one — or the cart edit that disarmed it — owns the order now.
				if (continuationRef.current !== continuation || continuation.abort.signal.aborted) return;
				continuationRef.current = null;
				if (!settled) {
					// Capped out. The next cart edit re-runs the replay, but the cashier must
					// hear about it NOW: the cart is showing totals the engine knows it could
					// not refresh (cashier-full-information ruling, 2026-08-07).
					cartLogger.warn('Coupon reference refresh timed out', {
						showToast: true,
						toast: { title: t('pos_cart.coupon_refresh_timeout') },
						context: { generation: continuation.generation },
					});
					return;
				}
				const latest = currentOrderRecord.getLatest();
				// Belt to the state key's braces: a delayed write must never reach an order that
				// is no longer an editable cart, whatever else moved. The foreground replay does
				// not need this — it is driven by an edit the cashier just made.
				if (latest.payload.status !== POS_OPEN_STATUS) return;
				// The order moved on — a newer edit, a checkout push, or a status change. That
				// write owns the order now; a replay computed against the old state must not
				// land on top of it.
				if (replayStateKey(latest) !== continuation.stateKey) return;
				// Write through the handle just read, never the one captured minutes ago: the key
				// proved the two are equal by VALUE, and this way the continuation holds no order
				// document alive for the length of its wait.
				await continuation.replay(latest);
			})().catch((error) =>
				cartLogger.error(String(error), { code: ERROR_CODES.CHECKOUT_UNEXPECTED })
			);
		},
		[
			couponReferenceGeneration,
			currentOrderRecord,
			disarmReplayContinuation,
			replayCoupons,
			t,
			whenCouponReferencesSettledInBackground,
		]
	);

	// This external wait belongs to the current order IDENTITY. Switching order tabs
	// (`setCurrentOrderID` swaps the context value without a remount) or unmounting aborts it and
	// drops the captured document, so nothing can fire against an order this tab no longer owns.
	//
	// Keyed on the uuid, deliberately not on `currentOrderRecord` itself: RxDB replaces the
	// immutable record instance whenever this order is written — routine background sync during
	// exactly the slow reference pull this continuation exists to outlast. Keying on the object
	// would abandon the replay for the very reason it was armed.
	const currentOrderUUID = currentOrderRecord.uuid;
	React.useEffect(
		() => () => {
			continuationRef.current?.abort.abort();
			continuationRef.current = null;
		},
		[currentOrderUUID]
	);

	const handleCartTotalChange = async () => {
		// Recalculate percentage-based fee lines
		const percentageFeeLines = (feeLines || []).filter((item: FeeLine) => {
			const { percent } = getFeeLineData(item);
			return percent;
		});

		if (percentageFeeLines.length > 0) {
			// Update each percentage fee line
			for (const feeLine of percentageFeeLines) {
				const uuid = getUuidFromLineItem(feeLine);
				await updateFeeLine(uuid ?? '', {});
			}
		}

		const freshOrder = currentOrderRecord.getLatest();
		const hasActiveCoupons = (freshOrder.payload.coupon_lines || []).some((cl) => cl.code != null);
		if (hasActiveCoupons) {
			// The demand declared above is asynchronous, and this edit can land while the pull
			// is still in flight — scanning now would hit the still-empty collections and throw
			// (or validate a category-restricted coupon against an empty tree). Wait for it, and
			// if the wait times out, bail rather than replaying against residents we know are
			// not ready: same "avoid partial data" rule as the missing-coupon bail below.
			if (!(await whenCouponReferencesSettled())) {
				// Bailing used to strand the cashier on stale totals until the next edit (#963).
				// Keep waiting off the critical path instead and replay when the references
				// actually land, guarded on this exact order revision.
				armReplayContinuation(freshOrder);
				return;
			}
			// The references are here, so this edit's own replay supersedes anything an earlier
			// edit left waiting — a stale continuation firing behind it would re-apply the
			// pre-edit discounts.
			disarmReplayContinuation();
			await replayCoupons(freshOrder);
		}
	};

	useSubscription(
		cartTotal$,
		() =>
			void handleCartTotalChange().catch((error) =>
				cartLogger.error(String(error), { code: ERROR_CODES.CHECKOUT_UNEXPECTED })
			)
	);

	return cartLines;
};
