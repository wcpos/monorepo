import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { CartContext } from './provider';

/**
 *
 */
export const useCart = () => {
	const context = React.useContext(CartContext);
	if (!context) {
		throw new Error(`useCart must be called within CartContext`);
	}

	return context;
};

/**
 *
 */
export const useSuspenedCart = () => {
	const context = React.useContext(CartContext);
	if (!context) {
		throw new Error(`useSuspenedCart must be called within CartContext`);
	}

	const data = useObservableSuspense(context.cartResource);
	// const deferredData = React.useDeferredValue(data);

	return { ...context, data };
};
