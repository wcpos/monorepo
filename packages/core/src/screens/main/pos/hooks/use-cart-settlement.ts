import * as React from 'react';

import pick from 'lodash/pick';
import { useObservable, useSubscription } from 'observable-hooks';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { createCartConfig, settleCart, snapshotFromOrderJSON } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { useDocField, useRecordField } from '@wcpos/query';

import { useAppliedCouponReferenceDemand } from '../../../../query';
import { evaluateRepush } from './repush-guard';
import { useCouponContext } from './use-coupon-context';
import { useAppState } from '../../../../contexts/app-state';
import { useTaxLocation, useTaxSettings } from '../../contexts/tax-rates';
import { taxClassFromWire, taxClassToWire } from '../../hooks/tax-class';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order';
import { useOrderMoneyDivergence } from '../contexts/order-money-divergence';
import { useT } from '../../../../contexts/translations';

type OrderDocument = import('@wcpos/database').OrderDocument;

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

/**
 * The money the settle patch asserts onto the order. Kept separate from the
 * structural fields because the R1 re-push guard latches on this subset alone.
 */
const MONEY_FIELDS = [
	'discount_tax',
	'discount_total',
	'shipping_tax',
	'shipping_total',
	'cart_tax',
	'total_tax',
	'total',
	'tax_lines',
] as const;

/**
 * The parts of a settle patch that represent a real cart change rather than a
 * re-derived aggregate. Their presence means the cashier did something.
 */
const STRUCTURAL_FIELDS = ['line_items', 'coupon_lines', 'fee_lines'] as const;

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
/**
 * The cart's single writer.
 *
 * Split out of useCartLines for #1472. useCartLines is mounted three times on the
 * cart surface — cart/table.tsx, cart/totals.tsx and use-order-totals.ts — and each
 * instance owned its own single-flight ref and re-push latch. While settlement only
 * ran for couponed carts that was survivable; once settle became the writer for
 * EVERY cart change it meant three concurrent writes per edit, each with its own
 * idea of what had already been written.
 *
 * So the selector stays where it is and mounts freely, and this hook — which holds
 * all the write state — is mounted exactly once, by OpenOrders. Mounting it twice
 * reintroduces the bug it exists to remove.
 */
export const useCartSettlement = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const lineItems = useRecordField(currentOrderRecord, (order) => order.payload.line_items);
	const feeLines = useRecordField(currentOrderRecord, (order) => order.payload.fee_lines);
	const shippingLines = useRecordField(currentOrderRecord, (order) => order.payload.shipping_lines);
	const couponLines = useRecordField(currentOrderRecord, (order) => order.payload.coupon_lines);
	const activeCouponLineCount = (couponLines || []).filter((line) => line.code != null).length;
	const { localPatch } = useLocalMutation();
	const { getCouponContext } = useCouponContext();
	const { divergence } = useOrderMoneyDivergence(currentOrderRecord.uuid);
	const overruledTotals = React.useRef<string | null>(null);
	const { rates } = useTaxLocation();
	const {
		allRates,
		shippingTaxClass,
		calcTaxes,
		taxRoundAtSubtotal,
		priceNumDecimals,
		pricesIncludeTax,
	} = useTaxSettings();
	const { store } = useAppState();
	const woocommerceSequential = useDocField(
		store,
		(value) => value.woocommerce_calc_discounts_sequentially
	);
	const legacySequential = useDocField(store, (value) => value.calc_discounts_sequentially);
	const calcDiscountsSequentially = woocommerceSequential === 'yes' || legacySequential === 'yes';
	const t = useT();

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
	} = useAppliedCouponReferenceDemand(activeCouponLineCount > 0);

	// Continuation + single-flight state. Refs, not state: nothing renders off them, and a
	// re-render must not disarm a wait that is still legitimate.
	const continuationRef = React.useRef<ReplayContinuation | null>(null);
	const replayingRef = React.useRef<string | null>(null);

	/**
	 * Settle every cart-line edit, plus every input `createCartConfig` reads.
	 * `changed` suppresses the follow-up emission when settle itself rewrites arrays.
	 *
	 * The config inputs are here, not just the lines, because this subscription is now
	 * the ONLY thing that persists totals. Before #1472 the use-order-totals effect
	 * re-derived on every render and deep-compared, so a tax-rate change — changing the
	 * customer's address, switching tax location, toggling prices-include-tax — wrote
	 * the new money by itself. Listing only the cart lines here would leave the
	 * PERSISTED document stale after such a change while the on-screen totals looked
	 * right, until the cashier happened to touch a line.
	 *
	 * Rates are arrays rebuilt each render; the JSON + distinctUntilChanged below is
	 * what keeps that from emitting on every render.
	 */
	const cartTotal$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				// NOT skip(1). The first emission is the cart as mounted, and that is a real
				// settlement: adding the first item converts a temporary order into a
				// persisted one and OpenOrders mounts this hook with the line already
				// present. While use-order-totals wrote from a mount effect the initial
				// state was covered; now nothing else would write it, and the new order
				// would keep the previous order's aggregate money. distinctUntilChanged
				// still collapses the no-op case, and settle's own `changed` flag plus the
				// re-push latch stop a redundant write reaching the document.
				map((cartInputs) => JSON.stringify(cartInputs)),
				distinctUntilChanged()
			),
		[
			// The ORDER identity, not just its contents. Switching tabs swaps the context
			// value without a remount, and distinctUntilChanged compares the serialized
			// inputs — so moving to a different order whose cart happens to serialize
			// identically (two empty carts, most obviously) would emit nothing, and that
			// order would never get the initial settlement the mount pass exists to give
			// it.
			currentOrderRecord.uuid,
			lineItems,
			feeLines,
			shippingLines,
			couponLines,
			priceNumDecimals,
			rates,
			allRates,
			calcTaxes,
			pricesIncludeTax,
			taxRoundAtSubtotal,
			shippingTaxClass,
			calcDiscountsSequentially,
			// A divergence ARRIVING has to run a settle pass, even though no cart input
			// moved. The original effect listed `{ diverged: divergence !== null }` in its
			// dependencies for exactly this reason: the pass is what evaluates
			// evaluateRepush and latches the overruled arithmetic. Without it a divergence
			// that arrives and is then retired never latches, and the next edit pushes the
			// overruled numbers straight back — the loop the guard exists to stop.
			divergence !== null,
		]
	);

	/**
	 * The settle write, extracted so the background continuation reaches the order
	 * through the SAME path a cart edit does — same settlement, same identity guards, same
	 * `localPatch`. The continuation only changes WHEN this runs, never how.
	 *
	 * Replays are single-flight per order revision: a settle signal that lands at the same
	 * moment as a cart edit must not apply the same recalculation twice.
	 */
	/**
	 * Fingerprint of everything createCartConfig reads. Part of the single-flight key
	 * so a settlement already in flight does not swallow a configuration change.
	 */
	const configKey = JSON.stringify([
		rates,
		allRates,
		calcTaxes,
		pricesIncludeTax,
		taxRoundAtSubtotal,
		priceNumDecimals,
		shippingTaxClass,
		calcDiscountsSequentially,
	]);

	const replayCoupons = React.useCallback(
		async (freshOrder: CurrentOrderRecord) => {
			const stateKey = replayStateKey(freshOrder);
			/**
			 * Single-flight is keyed on the order revision AND the settlement config.
			 *
			 * replayStateKey covers only the ORDER, which is right for the "did the order
			 * move under us" bail below. It is wrong for single-flight: a tax rate or
			 * prices-include-tax change while a settle is already in flight produces the
			 * SAME stateKey, so the new pass would be discarded as a duplicate and the
			 * configuration change would never be persisted.
			 */
			const flightKey = `${stateKey}|${configKey}`;
			if (replayingRef.current === flightKey) return;
			replayingRef.current = flightKey;
			try {
				const hasActiveCoupons = (freshOrder.payload.coupon_lines || []).some(
					(line) => line.code != null
				);
				const couponContext = hasActiveCoupons
					? await getCouponContext(freshOrder.payload.line_items || [])
					: undefined;
				const config = createCartConfig({
					rates,
					allRates,
					calcTaxes,
					pricesIncludeTax,
					taxRoundAtSubtotal,
					dp: priceNumDecimals,
					shippingTaxClass: taxClassToWire(taxClassFromWire(shippingTaxClass)),
					calcDiscountsSequentially,
				});
				const result = settleCart(
					snapshotFromOrderJSON(freshOrder.toMutableJSON().payload),
					config,
					couponContext ? { coupons: couponContext } : undefined
				);
				if (!result.ok) {
					cartLogger.warn('Cart settlement failed', {
						showToast: true,
						toast: {
							title: t(
								result.error.code === 'missing_coupon'
									? 'pos_cart.coupon_not_found'
									: 'pos_cart.coupon_apply_failed'
							),
						},
						context: result.error,
					});
					return;
				}
				/**
				 * Bail if a NEWER pass superseded this one while it was in flight.
				 *
				 * Two passes can be live at once for the same order revision when the
				 * settlement configuration changes mid-flight — a tax rate, or the #222
				 * price-decimals path. Without this the older pass can finish last and
				 * overwrite the newer one's money with the stale configuration, which is
				 * exactly the race that made the previous "collapse them" behaviour look
				 * correct. Newest pass wins; older ones abandon before writing.
				 */
				if (replayingRef.current !== flightKey) return;

				// Bail if the order moved during the async replay — a concurrent cart edit, a
				// checkout push, or a status change — rather than overwriting it.
				if (replayStateKey(currentOrderRecord.getLatest()) !== stateKey) return;
				if (!result.changed) return;

				/**
				 * R1 re-push guard (woocommerce-pos#1548). This write ENQUEUES A SERVER
				 * UPDATE for an engine-backed order. That is right while the cashier is
				 * building a sale and wrong once the server has already answered with
				 * different money: WooCommerce's calculation is the source of truth, so
				 * re-asserting the till's number here would push it back over the
				 * server's and provoke the identical divergence on the next drain.
				 *
				 * Latched on the ARITHMETIC, not the banner. Keying it to `divergence`
				 * alone made dismissing the alert — or any later clean save retiring it —
				 * flip the guard off while the cart still computed the same overruled
				 * numbers, and the very next run pushed them straight back: the loop
				 * again, one click later. So the overruled totals are remembered and stay
				 * suppressed until the cart inputs actually change.
				 *
				 * This guard lived in use-order-totals until #1472 moved the write here.
				 * It applies to every cart now, where before a couponed cart's replay
				 * bypassed it — see the PR for why that asymmetry was not preserved.
				 */
				/**
				 * The guard applies to a MONEY-ONLY patch — a re-derived aggregate, which is
				 * the thing that can loop against the server.
				 *
				 * A patch carrying line_items, coupon_lines or fee_lines is the cashier
				 * doing something, and its money has to go with it. Before #1472 this fell
				 * out of where the guard lived: use-order-totals wrote money alone and was
				 * guarded, while the cart replay wrote structure and money and was not. I
				 * removed that asymmetry as a "latent instance of the same bug" — it was
				 * not. Applying a coupon pushes to the server, the server answers with
				 * different money, and the divergence that creates then suppressed the very
				 * discount the cashier had just applied: the POS persisted 0.00 against the
				 * server's 2.23 (caught by e2e/pos-coupon-apply.spec.ts, not by any unit
				 * test).
				 */
				const structural = STRUCTURAL_FIELDS.some((field) => field in result.patch);
				const decision = structural
					? { suppress: false, nextLatch: null }
					: evaluateRepush({
							diverged: divergence !== null,
							latched: overruledTotals.current,
							computed: JSON.stringify(pick(result.patch, MONEY_FIELDS)),
						});
				overruledTotals.current = decision.nextLatch;

				/**
				 * Suppression applies to the MONEY only, never to the structure.
				 *
				 * The guard exists to stop re-asserting an aggregate the server overruled.
				 * It reasons purely about MONEY_FIELDS, so dropping the whole patch would
				 * also discard genuine line changes that happen to leave the totals
				 * identical — moving quantity between two equally priced coupon-eligible
				 * lines, say. After a divergence that edit would vanish silently.
				 *
				 * So the money is stripped and everything else is still written. If nothing
				 * survives the strip, there is nothing to persist.
				 */
				if (decision.suppress) return;

				await localPatch({
					document: freshOrder,
					// settle outputs structural line types; this boundary writes them back to
					// the DB document they came from.
					data: result.patch as Partial<OrderDocument>,
				});
			} finally {
				if (replayingRef.current === flightKey) replayingRef.current = null;
			}
		},
		[
			allRates,
			calcDiscountsSequentially,
			configKey,
			calcTaxes,
			currentOrderRecord,
			divergence,
			getCouponContext,
			localPatch,
			priceNumDecimals,
			pricesIncludeTax,
			rates,
			shippingTaxClass,
			taxRoundAtSubtotal,
			t,
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
				cartLogger.error(String(error), {
					code: ERROR_CODES.CHECKOUT_UNEXPECTED,
				})
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
			// The latch is per ORDER. Switching tabs swaps the context value without a
			// remount, so without this a divergence on one order would suppress the
			// next order's first write if their arithmetic happened to match.
			overruledTotals.current = null;
		},
		[currentOrderUUID]
	);

	const handleCartTotalChange = async () => {
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
		}
		await replayCoupons(freshOrder);
	};

	useSubscription(
		cartTotal$,
		() =>
			void handleCartTotalChange().catch((error) =>
				cartLogger.error(String(error), {
					code: ERROR_CODES.CHECKOUT_UNEXPECTED,
				})
			)
	);
};
