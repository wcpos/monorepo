import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';

/**
 * The save-time money mirror, held for the cashier (R1).
 *
 * WooCommerce's calculation is the source of truth and the POS mirrors it. When
 * the engine acks a saved order whose money is NOT what the POS sent, it emits
 * `order-money-divergence` — the mirror broke, and the person about to hand
 * goods across the counter is the one who needs to know.
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
 *  - Dismissal is per order and deliberate: this is not a transient
 *    notification the cashier may or may not have caught.
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
	/** The write whose ack broke the mirror — the retirement key below. */
	mutationId: string;
	fields: OrderMoneyDivergenceField[];
};

type DivergenceStore = {
	byOrderId: Record<string, OrderMoneyDivergence>;
	dismiss: (orderId: string) => void;
};

const OrderMoneyDivergenceContext = React.createContext<DivergenceStore | undefined>(undefined);

type DivergenceEvent = {
	type: string;
	collection?: string;
	recordId?: string;
	mutationId?: string;
	fields?: OrderMoneyDivergenceField[];
};

type ScopedState = {
	/** The store scope the held divergences belong to. */
	scopeId: string | null;
	byOrderId: Record<string, OrderMoneyDivergence>;
};

const NOTHING_HELD: Record<string, OrderMoneyDivergence> = {};

/** Write outcomes that prove the server ACCEPTED a later write for the record. */
const CLEAN_ACK_EVENTS = new Set(['write-acknowledged', 'write-ack-rematerialized']);

export function OrderMoneyDivergenceProvider({ children }: { children: React.ReactNode }) {
	const { engine } = useQueryRuntime();
	// Held divergences carry the SCOPE they were observed on, not the engine: a
	// same-site store switch deliberately KEEPS the engine instance, so keying on
	// engine identity would carry one store's alerts into the next. The scope is
	// derived at read time rather than cleared by a setState inside an effect —
	// which the React compiler rightly rejects as a cascading render, and which
	// loops outright if the engine reference is ever unstable.
	const activeScopeId = engine.status().activeScopeId;
	const [state, setState] = React.useState<ScopedState>(() => ({
		scopeId: activeScopeId,
		byOrderId: {},
	}));

	React.useEffect(() => {
		return engine.events((event) => {
			const message = event as DivergenceEvent;
			const orderId = message.recordId;
			if (typeof orderId !== 'string' || orderId === '') return;
			const scopeId = engine.status().activeScopeId;

			if (message.type === 'order-money-divergence') {
				const held: OrderMoneyDivergence = {
					orderId,
					mutationId: typeof message.mutationId === 'string' ? message.mutationId : '',
					fields: message.fields ?? [],
				};
				setState((current) => ({
					scopeId,
					// Last write wins: a second save of the same order re-states the
					// mirror, and the newest comparison is the one worth reviewing.
					// Anything held from another scope is dropped, not carried over.
					byOrderId:
						current.scopeId === scopeId
							? { ...current.byOrderId, [orderId]: held }
							: { [orderId]: held },
				}));
				return;
			}

			// A LATER write the server accepted without changing the money retires
			// the alert: the mirror is whole again, and a banner still quoting the
			// old amounts would be telling the cashier something untrue. The
			// mutationId guard is what keeps the divergence's OWN acknowledgement —
			// emitted in the same flush, immediately after it — from retiring it.
			// This is also the store's only automatic eviction path, so it cannot
			// grow without bound across a shift.
			if (message.collection !== 'orders' || !CLEAN_ACK_EVENTS.has(message.type)) return;
			setState((current) => {
				const held = current.byOrderId[orderId];
				if (!held || held.mutationId === message.mutationId) return current;
				const { [orderId]: _retired, ...rest } = current.byOrderId;
				return { scopeId: current.scopeId, byOrderId: rest };
			});
		});
	}, [engine]);

	const dismiss = React.useCallback((orderId: string) => {
		setState((current) => {
			if (!(orderId in current.byOrderId)) return current;
			const { [orderId]: _dismissed, ...rest } = current.byOrderId;
			return { scopeId: current.scopeId, byOrderId: rest };
		});
	}, []);

	const byOrderId = state.scopeId === activeScopeId ? state.byOrderId : NOTHING_HELD;

	const value = React.useMemo<DivergenceStore>(
		() => ({ byOrderId, dismiss }),
		[byOrderId, dismiss]
	);

	return (
		<OrderMoneyDivergenceContext.Provider value={value}>
			{children}
		</OrderMoneyDivergenceContext.Provider>
	);
}

/**
 * The divergence held for one order, if any, plus its dismissal.
 *
 * Returns a null divergence outside the provider rather than throwing: this is
 * an advisory surface, and a missing provider must never take the cart down
 * with it.
 *
 * @param orderId - The order's uuid; `undefined` for an unsaved new order.
 */
export function useOrderMoneyDivergence(orderId: string | undefined): {
	divergence: OrderMoneyDivergence | null;
	dismiss: () => void;
} {
	const store = React.useContext(OrderMoneyDivergenceContext);
	const divergence = orderId && store ? (store.byOrderId[orderId] ?? null) : null;
	const dismissOne = store?.dismiss;
	const dismiss = React.useCallback(() => {
		if (orderId && dismissOne) dismissOne(orderId);
	}, [orderId, dismissOne]);
	return { divergence, dismiss };
}
