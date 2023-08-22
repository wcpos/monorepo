import * as React from 'react';

import { CartHelpersContext } from './provider';

/**
 * A hook which returns multiple helper hooks :s
 */
export const useCartHelpers = () => {
	if (CartHelpersContext === undefined) {
		throw new Error(`useCartHelpers must be called within CartHelpersContext`);
	}

	const context = React.useContext(CartHelpersContext);
	return context;
};
