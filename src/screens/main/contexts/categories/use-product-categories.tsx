import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ProductCategoriesContext } from './provider';

export const useProductCategories = () => {
	const context = React.useContext(ProductCategoriesContext);
	if (!context) {
		throw new Error(`useProductCategories must be called within ProductCategoriesContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
