import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';

/**
 * The save-time money mirror, held for the cashier (R1, ADR 0032).
 *
 * WooCommerce owns money; the POS owns intent. `@wcpos/order-math` exists to
 * reproduce WooCommerce's arithmetic exactly, so when the engine acks a saved
 * order whose money is NOT what the POS sent, the reproduction is wrong —
 * a defect in the POS, a misconfigured store, or a store deliberately computing
 * something the POS does not model. All three are the same event here: the
 * server's figures stand, and the cashier is told before goods leave the
 * counter.
 *
 * Why a retained, per-order store rather than a toast at the emit site:
 *
 *  - Divergence can land on an order the cashier is not looking at. Open order
 *    tabs are a first-class POS feature, and a global toast for a background
 *    tab is noise at best and misattributed at worst. Keyed by order uuid, the
 *    alert waits on the tab it belongs to.
 *  - The event fires from a drain tick, which can complete while the cart is
 *    unmounted (small screens put the cart behind its own tab). A component-
 *    local subscription would simply miss it, so the subscription lives above
 *    the POS screens and outlives them.
 *
 * ── Why entries are STICKY (ADR 0032, replacing the retire-on-clean-ack rule) ─
 *
 * A held divergence does two jobs. It shows the cashier a notice, and it tells
 * `useCartSettlement` that this order's money now belongs to the server — so
 * the POS stops re-deriving that aggregate (`serverOwnsMoney` below).
 *
 * That second job is what makes retirement wrong. Once the POS has stopped
 * asserting its own money, every subsequent ack for the order is clean BY
 * CONSTRUCTION — there is nothing left for the server to overrule. Retiring on
 * a clean ack would therefore un-own the money on the very next write, the POS
 * would re-assert its arithmetic, the server would overrule it again, and the
 * order would oscillate: the divergence loop the old re-push guard existed to
 * defend against, arriving through the eviction path instead.
 *
 * So a diverged order stays diverged for as long as it is in the till. It is
 * not dismissible either: this is a broken product invariant, not a notice the
 * cashier may wave away. It clears on a store switch, or when the order leaves.
 *
 * Nothing here blocks the sale. The server's totals stand — the alert exists so
 * the cashier reviews them first.
 */
export type OrderMoneyDivergenceField = {
	/** Payload path, e.g. `total` or `line_items[<uuid>].total_tax`. */
	field: string;
	/** What the POS calculated, at the precision the comparison ran. */
	expected: string;
	/** What the store returned. */
	got: string;
};

export type OrderMoneyDivergence = {
	orderId: string;
	/** The write whose ack broke the mirror. */
	mutationId: string;
	fields: OrderMoneyDivergenceField[];
};

type DivergenceState = {
	engine: unknown;
	/** Display detail — the per-field comparison. Bounded; see MAX_HELD_DIVERGENCES. */
	byOrderId: Record<string, OrderMoneyDivergence>;
	/**
	 * Every order whose money the server has taken over, ids only, NEVER evicted.
	 *
	 * Separate from `byOrderId` because the two answer different questions and must
	 * not share a lifetime. `byOrderId` carries the `fields` payload a banner
	 * renders, and is capped so a shift against a badly misconfigured store cannot
	 * grow it without bound. Ownership is a correctness fact: while it holds, the
	 * settlement writer stands down.
	 *
	 * Deriving ownership from the capped map — as this first did — means the 51st
	 * divergence silently hands an earlier order's money BACK to the POS. That order
	 * does not have to be open at the time: completed orders are never removed, so
	 * fifty later sales are enough, and returning to a parked tab would then drop its
	 * warning and re-enable both settlement passes against arithmetic the server has
	 * already rejected. Ids are a few dozen bytes each; the bound belongs on the
	 * detail, not on the fact.
	 */
	serverOwnedOrderIds: ReadonlySet<string>;
	/**
	 * Distinct orders that have diverged since this engine last reset. Counted
	 * separately from `byOrderId` for the same reason — escalation is about how
	 * often the store disagrees, and that does not stop being true when an old
	 * entry is dropped.
	 */
	divergedOrderCount: number;
};

type DivergenceStore = {
	byOrderId: Record<string, OrderMoneyDivergence>;
	serverOwnedOrderIds: ReadonlySet<string>;
	divergedOrderCount: number;
};

const OrderMoneyDivergenceContext = React.createContext<DivergenceStore | undefined>(undefined);

type DivergenceEvent = {
	type: string;
	collection?: string;
	recordId?: string;
	mutationId?: string;
	fields?: OrderMoneyDivergenceField[];
};

/**
 * Diverged orders whose per-field DETAIL is kept for display.
 *
 * Sticky entries have no automatic eviction path (see the header), so a long
 * shift against a misconfigured store would otherwise grow this without bound.
 * The cap is a memory bound, not a product rule: the cashier only ever looks at
 * the order in front of them, and older ones are already counted above — and,
 * crucially, still owned by the server via `serverOwnedOrderIds`, which this
 * does not touch.
 */
const MAX_HELD_DIVERGENCES = 50;

/**
 * Distinct diverged orders that turn "this sale disagrees" into "this store
 * disagrees" (ADR 0032 §5.3). One is an anomaly the cashier reviews; three is a
 * condition of the install, and that is the signal that needs to reach support
 * rather than be absorbed sale after sale.
 */
export const STORE_LEVEL_DIVERGENCE_THRESHOLD = 3;

/**
 * The map without one order — so re-inserting it puts it at the END, which is
 * what makes key order mean "least recently diverged first". See `withinCap`.
 */
function withoutOrder(byOrderId: Record<string, OrderMoneyDivergence>, orderId: string) {
	if (!(orderId in byOrderId)) return byOrderId;
	const rest = { ...byOrderId };
	delete rest[orderId];
	return rest;
}

const NO_SERVER_OWNED: ReadonlySet<string> = new Set();
const EMPTY_STATE: DivergenceStore = {
	byOrderId: {},
	serverOwnedOrderIds: NO_SERVER_OWNED,
	divergedOrderCount: 0,
};

/**
 * Drop the LEAST RECENTLY DIVERGED entries once the held set outgrows its bound.
 *
 * Recency is carried by key order, which is why the caller re-inserts the order
 * rather than assigning over it: a JS object keeps a key at its ORIGINAL
 * insertion position when it is reassigned, so `{ ...current, [orderId]: held }`
 * leaves a re-diverging order exactly where it first landed. This cap would then
 * evict by FIRST divergence — and the order that has been diverged longest is,
 * on the misconfigured store that fills this map in the first place, a perfectly
 * good description of the sale in front of the cashier. Losing the notice on
 * THAT order is the failure ADR 0032 §5 spent a section refusing to allow via
 * the dismiss button; it must not arrive through eviction instead.
 *
 * `serverOwnedOrderIds` is unaffected either way — it is never evicted, so the
 * settlement writer stays stood down regardless. Only the display detail is at
 * stake here, which is precisely the half the cashier reads.
 */
function withinCap(byOrderId: Record<string, OrderMoneyDivergence>) {
	const ids = Object.keys(byOrderId);
	if (ids.length <= MAX_HELD_DIVERGENCES) return byOrderId;
	const kept: Record<string, OrderMoneyDivergence> = {};
	for (const id of ids.slice(ids.length - MAX_HELD_DIVERGENCES)) kept[id] = byOrderId[id];
	return kept;
}

export function OrderMoneyDivergenceProvider({ children }: { children: React.ReactNode }) {
	const { engine } = useQueryRuntime();
	// State carries the engine it was observed on. Engines are constructed per
	// site and never reused after disposal, so this identity check can only ever
	// hide entries — it can never let a stale one back in, which a scope-id check
	// would (store A → B → A matches again).
	const [state, setState] = React.useState<DivergenceState>(() => ({
		engine,
		byOrderId: {},
		serverOwnedOrderIds: NO_SERVER_OWNED,
		divergedOrderCount: 0,
	}));

	React.useEffect(() => {
		return engine.events((event) => {
			const message = event as DivergenceEvent;

			// A SAME-SITE store switch keeps this engine instance and only moves the
			// active scope, so identity alone would carry one till's alerts into the
			// next. The engine announces the move; clearing from the event handler
			// resets state for real — no read-time mask that a switch BACK could lift
			// again, and no setState in render or in an effect (the React compiler
			// rejects both, and the effect form loops if `engine` is ever unstable).
			//
			// The escalation count resets with it: "this store disagrees repeatedly"
			// is a claim about ONE store, and carrying a count across a switch would
			// escalate the next till for the previous one's misconfiguration.
			if (message.type === 'scope-switched') {
				setState((current) =>
					Object.keys(current.byOrderId).length === 0 &&
					current.serverOwnedOrderIds.size === 0 &&
					current.divergedOrderCount === 0 &&
					current.engine === engine
						? current
						: {
								engine,
								byOrderId: {},
								serverOwnedOrderIds: NO_SERVER_OWNED,
								divergedOrderCount: 0,
							}
				);
				return;
			}

			if (message.type !== 'order-money-divergence') return;

			const orderId = message.recordId;
			if (typeof orderId !== 'string' || orderId === '') return;

			const held: OrderMoneyDivergence = {
				orderId,
				mutationId: typeof message.mutationId === 'string' ? message.mutationId : '',
				fields: message.fields ?? [],
			};
			// Last write wins for the DETAIL: a second save of the same order
			// re-states the mirror, and the newest comparison is the one worth
			// reviewing. The COUNT only moves for an order that had not diverged
			// before — escalation measures how many sales the store disagreed on,
			// not how many times one sale was saved.
			setState((current) => {
				const sameEngine = current.engine === engine;
				const alreadySeen = sameEngine && current.serverOwnedOrderIds.has(orderId);
				return {
					engine,
					byOrderId: withinCap(
						sameEngine
							? { ...withoutOrder(current.byOrderId, orderId), [orderId]: held }
							: { [orderId]: held }
					),
					serverOwnedOrderIds: new Set(
						sameEngine ? [...current.serverOwnedOrderIds, orderId] : [orderId]
					),
					divergedOrderCount: (sameEngine ? current.divergedOrderCount : 0) + (alreadySeen ? 0 : 1),
				};
			});
		});
	}, [engine]);

	const sameEngine = state.engine === engine;
	const byOrderId = sameEngine ? state.byOrderId : EMPTY_STATE.byOrderId;
	const serverOwnedOrderIds = sameEngine ? state.serverOwnedOrderIds : NO_SERVER_OWNED;
	const divergedOrderCount = sameEngine ? state.divergedOrderCount : 0;

	const value = React.useMemo<DivergenceStore>(
		() => ({ byOrderId, serverOwnedOrderIds, divergedOrderCount }),
		[byOrderId, serverOwnedOrderIds, divergedOrderCount]
	);

	return (
		<OrderMoneyDivergenceContext.Provider value={value}>
			{children}
		</OrderMoneyDivergenceContext.Provider>
	);
}

/**
 * The divergence held for one order, if any.
 *
 * Returns a null divergence outside the provider rather than throwing: this is
 * an advisory surface, and a missing provider must never take the cart down
 * with it.
 *
 * `serverOwnsMoney` is the settlement rule, and it reads a DIFFERENT source from
 * `divergence` on purpose. Callers ask two different questions of this store —
 * "do I show the cashier a notice?" and "may I still derive this order's
 * money?" — and the second must never be answered from whatever the first
 * happens to be holding. Answering it from the banner's own state is exactly
 * what the old re-push guard's dismiss-flips-the-latch bug was, and deriving it
 * from the size-capped detail map reintroduced the same mistake by a quieter
 * route: the 51st divergence would have handed an earlier order's money back to
 * the POS. Ownership is never evicted; only the detail is.
 *
 * @param orderId - The order's uuid; `undefined` for an unsaved new order.
 */
export function useOrderMoneyDivergence(orderId: string | undefined): {
	divergence: OrderMoneyDivergence | null;
	serverOwnsMoney: boolean;
	/** Distinct orders this store has diverged on since the last scope switch. */
	divergedOrderCount: number;
} {
	const store = React.useContext(OrderMoneyDivergenceContext);
	const divergence = orderId && store ? (store.byOrderId[orderId] ?? null) : null;
	return {
		divergence,
		serverOwnsMoney: Boolean(orderId && store?.serverOwnedOrderIds.has(orderId)),
		divergedOrderCount: store?.divergedOrderCount ?? 0,
	};
}
