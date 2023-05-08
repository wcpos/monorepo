import * as React from 'react';

import { ProductCategoriesContext } from './provider';

export const useProductCategories = () => {
	const context = React.useContext(ProductCategoriesContext);
	if (!context) {
		throw new Error(`useProductCategories must be called within ProductCategoriesContext`);
	}

	return context;
};
