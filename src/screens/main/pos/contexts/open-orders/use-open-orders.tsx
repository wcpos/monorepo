import * as React from 'react';
import { OpenOrdersContext } from './provider';

/**
 *
 */
export const useCurrentOrder = () => {
	if (OpenOrdersContext === undefined) {
		throw new Error(`useOpenOrders must be called within OpenOrdersProvider`);
	}

	return React.useContext(OpenOrdersContext);
};
