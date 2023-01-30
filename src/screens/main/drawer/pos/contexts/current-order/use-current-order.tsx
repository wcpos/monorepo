import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { CurrentOrderContext } from './provider';

/**
 *
 */
export const useCurrentOrder = () => {
	if (CurrentOrderContext === undefined) {
		throw new Error(`useCurrentOrder must be called within CurrentOrderProvider`);
	}

	const { currentOrderResource } = React.useContext(CurrentOrderContext);
	const currentOrder = useObservableSuspense(currentOrderResource);

	return { currentOrder };
};
