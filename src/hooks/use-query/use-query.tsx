import * as React from 'react';
import { QueryContext } from './query-provider';

export const useQuery = () => {
	const context = React.useContext(QueryContext);
	if (context === undefined) {
		throw new Error(`useQuery must be called within QueryProvider`);
	}

	return context;
};
