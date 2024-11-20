import * as React from 'react';

import { CurrentOrderContext } from './provider';

/**
 *
 */
export const useCurrentOrder = () => {
	if (CurrentOrderContext === undefined) {
		throw new Error(`useCurrentOrder must be called within CurrentOrderProvider`);
	}

	const context = React.useContext(CurrentOrderContext);
	return context;
};
