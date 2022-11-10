import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { UIContext, UIResourceID } from './provider';

export const useUI = (id: UIResourceID) => {
	const context = React.useContext(UIContext);
	if (!context) {
		throw new Error(`useUI must be called within UIProvider`);
	}

	const resource = context.uiResources[id];
	const ui = useObservableSuspense(resource);
	return { ui };
};
