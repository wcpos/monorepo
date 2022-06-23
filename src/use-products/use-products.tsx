import * as React from 'react';
import { ProductsContext } from './products-provider';

export const useProducts = () => {
	const context = React.useContext(ProductsContext);
	if (!context) {
		throw new Error(`useProducts must be called within ProductsProvider`);
	}

	return context;
};
