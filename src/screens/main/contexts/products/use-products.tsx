import * as React from 'react';

import { ProductsContext } from './provider';

export const useProducts = () => {
	const context = React.useContext(ProductsContext);
	if (!context) {
		throw new Error(`useProducts must be called within ProductsContext`);
	}

	return context;
};
