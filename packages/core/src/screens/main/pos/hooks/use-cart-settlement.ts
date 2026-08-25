import * as React from 'react';

import { useObservable, useSubscription } from 'observable-hooks';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { settleAggregate, settleCart, snapshotFromOrderJSON } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { useRecordField } from '@wcpos/query';

import { useAppliedCouponReferenceDemand } from '../../../../query';
import { useCartConfig } from './use-cart-config';
import { useCouponContext } from './use-coupon-context';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';
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
	return JSON.stringify([replayContentKey(order), order.payload.date_modified_gmt ?? null]);
}

/**
 * The same identity MINUS the revision stamp: which order this is, whether it is
 * still the cart, and the lines the replay actually read.
 *
 * `date_modified_gmt` moves on ANY write to the order — a customer note, a
 * customer assignment, a routine background sync — none of which touch the cart
 * this pass computed for. Treating those as "the order moved under me" made the
 * replay abandon and, because the settlement trigger deliberately watches the
 * cart arrays rather than the revision stamp, nothing emitted a replacement
 * pass: the coupon allocation stayed stale until the cashier next touched a
 * line. So the bail asks the narrower question, and a pass whose content is
 * still current writes through the FRESH handle rather than throwing its work
 * away.
 */
function replayContentKey(order: CurrentOrderRecord): string {
	return JSON.stringify([
		order.uuid ?? null,
		order.payload.id ?? null,
		order.payload.status ?? null,
		order.payload.line_items ?? [],
		order.payload.fee_lines ?? [],
		order.payload.shipping_lines ?? [],
		order.payload.coupon_lines ?? [],
	]);
}

/** The only status a POS cart is editable in — see use-open-orders-resource / use-new-order. */
const POS_OPEN_STATUS = 'pos-open';

const hasActiveCouponLines = (order: CurrentOrderRecord) =>
	(order.payload.coupon_lines || []).some((line) => line.code != null);

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
 * The cart's single writer.
 *
 * Split out of useCartLines for #1472. useCartLines is mounted three times on the
 * cart surface — cart/table.tsx, cart/totals.tsx and use-order-totals.ts — and each
 * instance owned its own write state. While settlement only ran for couponed carts
 * that was survivable; once settle became the writer for EVERY cart change it meant
 * three concurrent writes per edit, each with its own idea of what had already been
 * written.
 *
 * So the selector stays where it is and mounts freely, and this hook — which holds
 * all the write state — is mounted exactly once, by OpenOrders. Mounting it twice
 * reintroduces the bug it exists to remove.
 *
 * ── Two passes, and why they are separate ───────────────────────────────────────
 *
 * 1. THE MONEY, promptly. `settleAggregate` over the lines exactly as persisted.
 *    Pure, synchronous, and — this is the whole point — reached with NO await in
 *    front of it. The cashier can save a fraction of a second after an edit, and
 *    whatever is on the document at that moment is what the sale is worth.
 *
 * 2. THE COUPON REDISTRIBUTION, when it is needed. A cart edit under an active
 *    coupon changes how that coupon's discount spreads across the lines, and
 *    working that out needs the coupon records, which may not be resident (#952).
 *    So it waits, and its output arrives as new LINES — which brings pass 1 round
 *    again to re-derive the money over them.
 *
 * Routing pass 1 through `settleCart` is what broke `pos-coupon-apply.spec.ts`:
 * settleCart gates on having every active coupon in hand, so the money write sat
 * behind a reference prefetch that only pass 2 ever needed, and a couponed cart
 * saved with `discount_total: 0`. Prompt is not an optimisation here — it is the
 * correctness property.
 *
 * ── Divergence (ADR 0032) ───────────────────────────────────────────────────────
 *
 * WooCommerce owns money. Once the server has overruled this order's arithmetic,
 * BOTH passes stand down for good: re-deriving an aggregate the server has already
 * rejected is how the POS argues with its own source of truth. The cashier's
 * structural edits still push — `use-update-line-item` sends `line_items` and no
 * top-level money — so the order keeps moving as intent, and the server's answer is
 * adopted on each ack. Local arithmetic carries on for DISPLAY and for offline
 * operation; it simply stops being an assertion.
 *
 * There is no re-push guard here, no latch and no suppression rule. Three attempts
 * to state that rule correctly were all wrong (see ADR 0032 §Context) because the
 * question — "may I assert my number again?" — has no good answer. This one does
 * not ask it.
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
	const { serverOwnsMoney } = useOrderMoneyDivergence(currentOrderRecord.uuid);
	const reportEngineWarnings = useReportEngineWarnings();
	const cartConfig = useCartConfig();
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

	// Read by an in-flight replay that started before the divergence arrived. See the
	// check in replayCoupons for why the closure's own copy is not good enough.
	const serverOwnsMoneyRef = React.useRef(serverOwnsMoney);
	React.useEffect(() => {
		serverOwnsMoneyRef.current = serverOwnsMoney;
	}, [serverOwnsMoney]);

	/**
	 * Settle every cart-line edit, plus every store setting the cart config is built from.
	 *
	 * The config is here, not just the lines, because this subscription is now
	 * the ONLY thing that persists totals. Before #1472 the use-order-totals effect
	 * re-derived on every render and deep-compared, so a tax-rate change — changing the
	 * customer's address, switching tax location, toggling prices-include-tax — wrote
	 * the new money by itself. Listing only the cart lines here would leave the
	 * PERSISTED document stale after such a change while the on-screen totals looked
	 * right, until the cashier happened to touch a line.
	 *
	 * Rates are arrays rebuilt each render; the JSON + distinctUntilChanged below is
	 * what keeps that from emitting on every render.
	 *
	 * Divergence is NOT an input. It used to be, because a divergence arriving had to
	 * run a pass to latch the overruled arithmetic. There is no latch now — divergence
	 * makes this hook stand down rather than compute something — so a pass on arrival
	 * would have nothing to do.
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
				// still collapses the no-op case, and settle's own `changed` flag stops a
				// redundant write reaching the document.
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
			cartConfig,
		]
	);

	/**
	 * Fingerprint of the settlement configuration. Part of the replay's single-flight
	 * key so a settlement already in flight does not swallow a configuration change.
	 *
	 * Serialised from the config itself rather than from the settings it was built
	 * from: the config IS the set of values the engine reads, so the two cannot drift.
	 */
	const configKey = React.useMemo(() => JSON.stringify(cartConfig), [cartConfig]);

	/**
	 * Pass 1 — the money over the lines as they are persisted, right now.
	 *
	 * Nothing is awaited before the write is HANDED OFF, and nothing may be added
	 * that is. The one guarantee this pass makes is that the aggregate on the
	 * document matches the lines on the document by the time the cashier's next
	 * action can read it.
	 *
	 * LOCAL ONLY, since #1507. Every field this patch writes is server-authored
	 * money — `readonly` in the wc/v3 order schema, recomputed by WooCommerce
	 * from the lines — so `localPatch` applies it to the record and enqueues
	 * nothing. That is not a weakening of the guarantee above: the guarantee was
	 * always about the DOCUMENT, which is what the cart displays and what an
	 * offline till runs on. It only stops being a claim made to the server. A
	 * pass that also recomputes a percent fee still enqueues, because
	 * `fee_lines[].total` is the cashier's intent and the server keeps it.
	 *
	 * The writes are serialized through `moneyWriteChain` because the aggregate is
	 * asserted WHOLESALE — every money field, every time — so the last write to land
	 * is the one that stands. `localPatch` awaits the engine resident before it
	 * applies anything, and two passes can be inside that await at once (a tax-rate
	 * change, or a fast second edit). Unordered, the older pass can finish last and
	 * leave the document holding money derived from lines that have since moved.
	 * Nothing would repair it either: the aggregate is deliberately NOT an input to
	 * `cartTotal$`, so a stale overwrite emits no follow-up pass and the cart carries
	 * the wrong total until the cashier happens to touch a line.
	 *
	 * Chaining, rather than a single-flight key like the replay's: passes are queued
	 * in emission order and applied in emission order, so the newest is always last.
	 * When nothing is in flight the chain is already resolved, so this costs one
	 * microtask — the promptness the split exists to protect is untouched.
	 */
	const moneyWriteChain = React.useRef<Promise<unknown>>(Promise.resolve());

	const settleMoney = React.useCallback(
		async (freshOrder: CurrentOrderRecord) => {
			const result = settleAggregate(
				snapshotFromOrderJSON(freshOrder.toMutableJSON().payload),
				cartConfig
			);
			// Before the `changed` bail, not after: a cart whose money is already
			// correct can still be resting on a tax rate the store has dropped, and
			// that is precisely the order the cashier must be told about.
			reportEngineWarnings(result.warnings, {
				orderId: freshOrder.uuid,
				site: 'settleAggregate',
			});
			if (!result.changed) return;
			const write = moneyWriteChain.current.then(() =>
				localPatch({
					document: freshOrder,
					data: result.patch as Partial<OrderDocument>,
				})
			);
			// The chain must survive a failed write, or one rejection would strand every
			// later settlement behind it. The caller still sees the rejection.
			moneyWriteChain.current = write.catch(() => undefined);
			await write;
		},
		[cartConfig, localPatch, reportEngineWarnings]
	);

	/**
	 * Pass 2 — redistribute the active coupons across the lines, then re-derive.
	 *
	 * Extracted so the background continuation reaches the order through the SAME path
	 * a cart edit does — same settlement, same identity guards, same `localPatch`. The
	 * continuation only changes WHEN this runs, never how.
	 *
	 * Single-flight per (order revision, settlement config): a settle signal that lands
	 * at the same moment as a cart edit must not apply the same recalculation twice.
	 */
	const replayCoupons = React.useCallback(
		async (freshOrder: CurrentOrderRecord) => {
			const stateKey = replayStateKey(freshOrder);
			/**
			 * replayStateKey covers only the ORDER, which is right for the "did the order
			 * move under us" bail below. It is wrong on its own for single-flight: a tax
			 * rate or prices-include-tax change while a replay is already in flight
			 * produces the SAME stateKey, so the new pass would be discarded as a
			 * duplicate and the configuration change would never reach the lines.
			 */
			const flightKey = `${stateKey}|${configKey}`;
			if (replayingRef.current === flightKey) return;
			replayingRef.current = flightKey;
			try {
				const couponContext = await getCouponContext(freshOrder.payload.line_items || []);
				const result = settleCart(
					snapshotFromOrderJSON(freshOrder.toMutableJSON().payload),
					cartConfig,
					{ coupons: couponContext }
				);
				// BOTH branches carry warnings, and the failed one is where they matter
				// most: the coupon gate stopped the replay, so whatever the engine could
				// not read is still on the order the cashier is about to charge for.
				reportEngineWarnings(result.warnings, {
					orderId: freshOrder.uuid,
					site: 'settleCart',
				});
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
				 * overwrite the newer one's lines with the stale configuration. Newest
				 * pass wins; older ones abandon before writing.
				 */
				if (replayingRef.current !== flightKey) return;
				if (!result.changed) return;

				/**
				 * The order moved under this pass — a concurrent cart edit, a checkout
				 * push, a status change, or something that touched the order without
				 * touching the cart. Only the first three invalidate the work: this pass
				 * read the four line arrays, and if those (and the order's identity and
				 * status) still hold, the patch it computed is still the right patch.
				 */
				const latest = currentOrderRecord.getLatest();
				if (replayContentKey(latest) !== replayContentKey(freshOrder)) return;

				/**
				 * A divergence that arrived WHILE this pass was awaiting its coupon
				 * context. `serverOwnsMoney` is a render value captured in this closure,
				 * so the pass that started before the divergence would otherwise carry on
				 * and assert money the server has just overruled. Read through a ref so
				 * the check sees the divergence that landed a moment ago — this is the
				 * hole the deleted flight-key divergence input used to paper over.
				 */
				if (serverOwnsMoneyRef.current) return;

				await localPatch({
					// Through the handle just read, not the one this pass started with: a
					// metadata write may have replaced the resident while the coupon
					// context was in flight, and the content key above proved the two are
					// equal in everything this patch depends on.
					document: latest,
					// settle outputs structural line types; this boundary writes them back to
					// the DB document they came from.
					data: result.patch as Partial<OrderDocument>,
				});
			} finally {
				if (replayingRef.current === flightKey) replayingRef.current = null;
			}
		},
		[
			cartConfig,
			configKey,
			currentOrderRecord,
			getCouponContext,
			localPatch,
			reportEngineWarnings,
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
					// hear about it NOW: the cart is showing a coupon distribution the engine
					// knows it could not refresh (cashier-full-information ruling, 2026-08-07).
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
		},
		[currentOrderUUID]
	);

	const handleCartTotalChange = async () => {
		const freshOrder = currentOrderRecord.getLatest();

		// ADR 0032: the server overruled this order's arithmetic, so its money is the
		// server's now and the POS stops deriving it. Both passes, not just the money
		// one — a coupon replay rewrites line-level `total`/`total_tax`, which is the
		// same claim by another route.
		if (serverOwnsMoney) {
			disarmReplayContinuation();
			return;
		}

		// Pass 1, before anything can await. Its patch touches money and percent fees
		// only, so it cannot race pass 2's structural output.
		await settleMoney(freshOrder);

		if (!hasActiveCouponLines(freshOrder)) return;

		// Pass 1 just wrote, which moves `date_modified_gmt` and so the replay state
		// key. Re-read rather than replaying against the handle from before the write —
		// the stale key would make every couponed replay bail on its own predecessor.
		const afterMoney = currentOrderRecord.getLatest();

		// The demand declared above is asynchronous, and this edit can land while the pull
		// is still in flight — scanning now would hit the still-empty collections and fail
		// the missing-coupon gate (or validate a category-restricted coupon against an
		// empty tree). Wait for it, and if the wait times out, keep waiting off the
		// critical path rather than replaying against residents we know are not ready.
		if (!(await whenCouponReferencesSettled())) {
			// Bailing used to strand the cashier on stale totals until the next edit (#963).
			armReplayContinuation(afterMoney);
			return;
		}
		// The references are here, so this edit's own replay supersedes anything an earlier
		// edit left waiting — a stale continuation firing behind it would re-apply the
		// pre-edit discounts.
		disarmReplayContinuation();
		await replayCoupons(afterMoney);
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
