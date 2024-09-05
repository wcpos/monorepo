import * as React from 'react';

import { StatesContext } from './states-provider';

export const useStates = () => {
	const context = React.useContext(StatesContext);
	if (!context) {
		throw new Error(`useStates must be called within StatesContext`);
	}

	return context;
};
