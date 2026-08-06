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
	fields?: OrderMoneyDivergenceField[];
};

type ScopedState = {
	/** The engine the held divergences belong to. */
	engine: unknown;
	byOrderId: Record<string, OrderMoneyDivergence>;
};

const NOTHING_HELD: Record<string, OrderMoneyDivergence> = {};

export function OrderMoneyDivergenceProvider({ children }: { children: React.ReactNode }) {
	const { engine } = useQueryRuntime();
	// The held divergences carry the engine they were observed on, so a store
	// switch is DERIVED at read time rather than cleared by a setState inside an
	// effect — which the React compiler rightly rejects as a cascading render,
	// and which loops outright if the engine reference is ever unstable.
	const [state, setState] = React.useState<ScopedState>(() => ({
		engine,
		byOrderId: {},
	}));

	React.useEffect(() => {
		return engine.events((event) => {
			const divergence = event as DivergenceEvent;
			if (divergence.type !== 'order-money-divergence') return;
			const orderId = divergence.recordId;
			if (typeof orderId !== 'string' || orderId === '') return;
			const held: OrderMoneyDivergence = {
				orderId,
				fields: divergence.fields ?? [],
			};
			setState((current) => ({
				engine,
				// Last write wins: a second save of the same order re-states the
				// mirror, and the newest comparison is the one worth reviewing.
				// Anything held from a previous scope is dropped, not carried over.
				byOrderId:
					current.engine === engine
						? { ...current.byOrderId, [orderId]: held }
						: { [orderId]: held },
			}));
		});
	}, [engine]);

	const dismiss = React.useCallback((orderId: string) => {
		setState((current) => {
			if (!(orderId in current.byOrderId)) return current;
			const { [orderId]: _dismissed, ...rest } = current.byOrderId;
			return { engine: current.engine, byOrderId: rest };
		});
	}, []);

	const byOrderId = state.engine === engine ? state.byOrderId : NOTHING_HELD;

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
