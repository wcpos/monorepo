import * as React from 'react';
import { UIResourceContext } from './ui-resource-provider';

const useUI = () => {
	const context = React.useContext(UIResourceContext);
	if (context === undefined) {
		throw new Error(`useUI must be called within UIResourceProvider`);
	}

	return context;
};

export default useUI;
