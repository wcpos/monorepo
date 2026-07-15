import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';
import { useObservableSuspense } from 'observable-hooks';

import type { OrderDocument } from '@wcpos/database';

import { convertUTCStringToLocalDate } from '../../../hooks/use-local-date';
import { useQueryState } from '../../../query';

import type { RowSelectionState } from '@tanstack/react-table';
import type { useCollectionBinding } from '../../../query';

export interface DateRange {
	start: Date;
	end: Date;
}

interface ReportsContextType {
	binding: ReturnType<typeof useCollectionBinding<'orders'>>;
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
	binding: ReturnType<typeof useCollectionBinding<'orders'>>;
	children: React.ReactNode;
}

/**
 *
 */
export function ReportsProvider({ binding, children }: ReportsProviderProps) {
	const result = useObservableSuspense(binding.resource);
	const [unselectedRowIds, setUnselectedRowIds] = React.useState<RowSelectionState>({});
	const selectedDateRange = useQueryState<'orders', { from: string; to: string } | undefined>(
		(state) => state.filters.dateRange
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

		return {
			start: selectedDateRange.from
				? convertUTCStringToLocalDate(selectedDateRange.from)
				: defaultRange.start,
			end: selectedDateRange.to
				? convertUTCStringToLocalDate(selectedDateRange.to)
				: defaultRange.end,
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

		return allOrders.filter((order) => order.uuid && !unselectedRowIds[order.uuid]);
	}, [allOrders, unselectedRowIds]);

	return (
		<ReportsContext.Provider
			value={{
				binding,
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
}
