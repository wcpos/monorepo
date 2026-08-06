import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';

import { useEngineStatus } from '../../../hooks/use-engine-monitor';

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

/** Write outcomes that prove the server ACCEPTED a later write for the record. */
const CLEAN_ACK_EVENTS = new Set(['write-acknowledged', 'write-ack-rematerialized']);

/**
 * The retained store for ONE store scope.
 *
 * Scope isolation is a REMOUNT, not a filter. Hiding a foreign scope's entries
 * behind a read-time check leaves them sitting in state, so a cashier who moves
 * store A → B → A watches A's stale banners come back from the dead. Remounting
 * on the scope key throws the state away for real and rebinds the subscription
 * — and does so without a setState in render or in an effect, both of which the
 * React compiler rejects (and the effect form loops outright whenever the
 * engine reference is not stable).
 */
function ScopedOrderMoneyDivergenceProvider({
	engine,
	children,
}: {
	engine: ReturnType<typeof useQueryRuntime>['engine'];
	children: React.ReactNode;
}) {
	const [byOrderId, setByOrderId] = React.useState<Record<string, OrderMoneyDivergence>>({});

	React.useEffect(() => {
		return engine.events((event) => {
			const message = event as DivergenceEvent;
			const orderId = message.recordId;
			if (typeof orderId !== 'string' || orderId === '') return;

			if (message.type === 'order-money-divergence') {
				const held: OrderMoneyDivergence = {
					orderId,
					mutationId: typeof message.mutationId === 'string' ? message.mutationId : '',
					fields: message.fields ?? [],
				};
				// Last write wins: a second save of the same order re-states the
				// mirror, and the newest comparison is the one worth reviewing.
				setByOrderId((current) => ({ ...current, [orderId]: held }));
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
			setByOrderId((current) => {
				const held = current[orderId];
				if (!held || held.mutationId === message.mutationId) return current;
				const { [orderId]: _retired, ...rest } = current;
				return rest;
			});
		});
	}, [engine]);

	const dismiss = React.useCallback((orderId: string) => {
		setByOrderId((current) => {
			if (!(orderId in current)) return current;
			const { [orderId]: _dismissed, ...rest } = current;
			return rest;
		});
	}, []);

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

export function OrderMoneyDivergenceProvider({ children }: { children: React.ReactNode }) {
	const { engine } = useQueryRuntime();
	// A same-site store switch deliberately KEEPS the engine instance and only
	// moves the active scope, so the engine reference is not what changes — the
	// scope is, and it has to be read REACTIVELY. A bare `engine.status()` during
	// render is only ever as fresh as the next re-render, which nothing here
	// guarantees.
	const { activeScopeId } = useEngineStatus();

	return (
		<ScopedOrderMoneyDivergenceProvider key={activeScopeId ?? 'no-scope'} engine={engine}>
			{children}
		</ScopedOrderMoneyDivergenceProvider>
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
