import * as React from 'react';

export const VariationTableContext = React.createContext(null);

export const useVariationTable = () => {
	const context = React.useContext(VariationTableContext);
	if (!context) {
		throw new Error(`useVariationTable must be called within VariationTableContext`);
	}

	return context;
};
