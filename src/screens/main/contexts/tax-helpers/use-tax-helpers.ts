import * as React from 'react';

import { TaxHelpersContext } from './provider';

/**
 * A hook which returns multiple helper hooks :s
 */
export const useTaxHelpers = () => {
	if (TaxHelpersContext === undefined) {
		throw new Error(`useTaxHelpers must be called within TaxHelpersContext`);
	}

	const context = React.useContext(TaxHelpersContext);
	return context;
};
