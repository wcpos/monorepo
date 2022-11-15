import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ProductsContext } from './provider';

export const useProducts = () => {
	const context = React.useContext(ProductsContext);
	if (!context) {
		throw new Error(`useProducts must be called within ProductsContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
