import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { GatewaysContext } from './provider';

export const useGateways = () => {
	const context = React.useContext(GatewaysContext);
	if (!context) {
		throw new Error(`useGateways must be called within GatewaysContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
