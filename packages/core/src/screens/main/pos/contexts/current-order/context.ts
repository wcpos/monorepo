import * as React from 'react';

type OrderDocument = import('@wcpos/database').OrderDocument;

export interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
	openOrders: { id: string; document: OrderDocument }[];
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
