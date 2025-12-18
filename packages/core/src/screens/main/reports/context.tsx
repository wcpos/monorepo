import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';
import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { OrderCollection, OrderDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import type { RowSelectionState } from '@tanstack/react-table';

import { convertUTCStringToLocalDate } from '../../../hooks/use-local-date';

export interface DateRange {
	start: Date;
	end: Date;
}

interface ReportsContextType {
	query: Query<OrderCollection>;
	allOrders: OrderDocument[];
	selectedOrders: OrderDocument[];
	unselectedRowIds: RowSelectionState;
	setUnselectedRowIds: React.Dispatch<React.SetStateAction<RowSelectionState>>;
	dateRange: DateRange;
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

interface ReportsProviderProps {
	query: Query<OrderCollection>;
	children: React.ReactNode;
}

/**
 *
 */
export const ReportsProvider = ({ query, children }: ReportsProviderProps) => {
	const result = useObservableSuspense(query.resource);
	const [unselectedRowIds, setUnselectedRowIds] = React.useState<RowSelectionState>({});

	/**
	 * Get the date range from the query selector - updates when filter changes
	 */
	const selectedDateRange = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('date_created_gmt')))
	);

	/**
	 * Convert the selector's date range to Date objects
	 */
	const dateRange = React.useMemo<DateRange>(() => {
		const today = new Date();
		const defaultRange = { start: startOfDay(today), end: endOfDay(today) };

		if (!selectedDateRange) {
			return defaultRange;
		}

		const { $gte, $lte } = selectedDateRange;
		return {
			start: $gte ? convertUTCStringToLocalDate($gte) : defaultRange.start,
			end: $lte ? convertUTCStringToLocalDate($lte) : defaultRange.end,
		};
	}, [selectedDateRange]);

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
				dateRange,
			}}
		>
			{children}
		</ReportsContext.Provider>
	);
};
