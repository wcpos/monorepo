import * as React from 'react';

import { ExtraDataContext } from './provider';

/**
 *
 */
export const useExtraData = () => {
	if (ExtraDataContext === undefined) {
		throw new Error(`useExtraData must be called within ExtraDataContext`);
	}

	const context = React.useContext(ExtraDataContext);
	return context;
};
