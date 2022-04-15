import * as React from 'react';
import { ResourceContext } from './resource-provider';

export const useResource = () => {
	const context = React.useContext(ResourceContext);
	if (!context) {
		throw new Error(`useResource must be called within ResourceContextProvider`);
	}
	return context;
};
