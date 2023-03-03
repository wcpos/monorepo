import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ProductTagsContext } from './provider';

export const useProductTags = () => {
	const context = React.useContext(ProductTagsContext);
	if (!context) {
		throw new Error(`useProductTags must be called within ProductTagsContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
