import * as React from 'react';

export const TableContext = React.createContext<import('./').TableContextProps<any> | null>(null);

export const useTable = () => {
	const context = React.useContext(TableContext);
	if (!context) {
		throw new Error(`useTable must be called within TableContext`);
	}

	return context;
};
