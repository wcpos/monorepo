import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { CartContext } from './provider';

export const useCart = () => {
	const context = React.useContext(CartContext);
	if (!context) {
		throw new Error(`useCart must be called within CartContext`);
	}

	const data = useObservableSuspense(context.cartResource);

	return data;
};
