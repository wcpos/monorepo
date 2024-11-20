import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import type { OrderCollection, OrderDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import type { RowSelectionState } from '@tanstack/react-table';

interface ReportsContextType {
	query: Query<OrderCollection>;
	allOrders: OrderDocument[];
	selectedOrders: OrderDocument[];
	unselectedRowIds: RowSelectionState;
	setUnselectedRowIds: React.Dispatch<React.SetStateAction<RowSelectionState>>;
}

/**
 *
 */
const ReportsContext = React.createContext<ReportsContextType | undefined>(undefined);

/**
 *
 */
export const useReports = () => {
	const context = React.useContext(ReportsContext);
	if (!context) {
		throw new Error('useReports must be used within a ReportsContext');
	}
	return context;
};

/**
 *
 */
export const ReportsProvider = ({ query, children }) => {
	const result = useObservableSuspense(query.resource);
	const [unselectedRowIds, setUnselectedRowIds] = React.useState<RowSelectionState>({});

	/**
	 *
	 */
	const allOrders = React.useMemo(
		() => result.hits.map((hit) => hit.document as OrderDocument),
		[result.hits]
	);

	/**
	 * Remove unselectedRowIds from orders
	 */
	const selectedOrders = React.useMemo(() => {
		if (Object.keys(unselectedRowIds).length === 0) {
			return allOrders;
		}

		return allOrders.filter((order) => !unselectedRowIds[order.uuid]);
	}, [allOrders, unselectedRowIds]);

	return (
		<ReportsContext.Provider
			value={{
				query,
				allOrders,
				selectedOrders,
				unselectedRowIds,
				setUnselectedRowIds,
			}}
		>
			{children}
		</ReportsContext.Provider>
	);
};
