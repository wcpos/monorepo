import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { ProductVariationsContext } from './product-variations-provider';

export const useProductVariations = () => {
	const context = React.useContext(ProductVariationsContext);
	if (!context) {
		throw new Error(`useProductVariations must be called within ProductVariationProvider`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
