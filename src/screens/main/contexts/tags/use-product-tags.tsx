import * as React from 'react';

import { ProductTagsContext } from './provider';

export const useProductTags = () => {
	const context = React.useContext(ProductTagsContext);
	if (!context) {
		throw new Error(`useProductTags must be called within ProductTagsContext`);
	}

	return context;
};
