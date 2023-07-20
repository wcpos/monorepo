import * as React from 'react';

import { VariationsContext } from './provider';

export const useVariations = () => {
	const context = React.useContext(VariationsContext);
	if (!context) {
		throw new Error(`useVariations must be called within VariationsContext`);
	}

	return context;
};
