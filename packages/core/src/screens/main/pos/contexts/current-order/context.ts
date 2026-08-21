import * as React from 'react';

type OrderDocument = import('@wcpos/database').OrderDocument;
type TemporaryOrderDocument = import('@wcpos/database').TemporaryOrderDocument;
type EngineOrderRecord = import('@wcpos/query').EngineRecord<'orders'>;

export type CurrentOrderRecord = EngineOrderRecord | TemporaryOrderDocument;
export type OpenOrderHit = { id: string; document: OrderDocument; record: EngineOrderRecord };

export interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
	currentOrderRecord: CurrentOrderRecord;
	openOrders: OpenOrderHit[];
	setCurrentOrderID: (id: string) => void;
}

/**
 * The context and its read hooks live here, apart from the provider.
 *
 * The provider needs `expo-router` (to sync the order id into the URL), and importing it
 * drags the whole navigator dependency tree — react-native-safe-area-context, native
 * codegen — into anything that merely wants to READ the current order. That broke the
 * tax-rates provider's test environment the moment it subscribed to the order.
 *
 * Readers import from here; only the provider imports the provider.
 */
export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(
	null as unknown as CurrentOrderContextProps
);

/**
 *
 */
export const useCurrentOrder = () => {
	const context = React.useContext(CurrentOrderContext);
	if (!context) {
		throw new Error(`useCurrentOrder must be called within CurrentOrderProvider`);
	}
	return context;
};

/**
 * The current order if there is one, `undefined` outside a `CurrentOrderProvider`.
 *
 * For providers mounted on BOTH the POS screen (inside a current order) and elsewhere (the
 * standalone Products screen, which has no order). Lets such a provider subscribe to the
 * order itself instead of being handed it as a prop from an ancestor — which is what
 * dragged the whole POS navigator into every cart write.
 */
export const useCurrentOrderOptional = (): OrderDocument | undefined => {
	const context = React.useContext(CurrentOrderContext);
	return context?.currentOrder;
};

export const useCurrentOrderRecord = (): CurrentOrderRecord => {
	const context = React.useContext(CurrentOrderContext);
	if (!context) {
		throw new Error(`useCurrentOrderRecord must be called within CurrentOrderProvider`);
	}
	return context.currentOrderRecord;
};

export interface CurrentOrderActions {
	/** The current order AT CALL TIME. Never call during render — that is the whole point. */
	getCurrentOrder: () => OrderDocument;
	getCurrentOrderRecord: () => CurrentOrderRecord;
	setCurrentOrderID: (id: string) => void;
}

/**
 * Stable, for code that MUTATES the order rather than displays it.
 *
 * This value never changes identity, so subscribing to it costs nothing. `useCurrentOrder()`
 * republishes on every cart write — correct for anything rendering the cart, ruinous for
 * anything that merely holds a button.
 *
 * That distinction is the bug this exists to fix. Every product tile calls `useAddProduct()`,
 * which called `useCurrentOrder()` purely so its click handler could read the order — so
 * every cart write re-rendered every visible tile. Measured at 20 tiles x 4 writes = 80
 * commits per add or remove, and no amount of memoisation further down could help, because
 * the tiles were genuinely subscribed to a value that genuinely changed.
 */
export const CurrentOrderActionsContext = React.createContext<CurrentOrderActions | null>(null);

/**
 * The order-mutating half. Resolve the order when the user acts, not while rendering.
 */
export const useCurrentOrderActions = (): CurrentOrderActions => {
	const context = React.useContext(CurrentOrderActionsContext);
	if (!context) {
		throw new Error('useCurrentOrderActions must be called within CurrentOrderProvider');
	}
	return context;
};
