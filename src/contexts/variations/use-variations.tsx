import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { VariationsContext } from './provider';

export const useVariations = () => {
	const context = React.useContext(VariationsContext);
	if (!context) {
		throw new Error(`useVariations must be called within VariationsContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
