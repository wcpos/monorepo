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

/** The query binding. Changes only when the provider is handed a new one. */
export interface ReportsBinding {
	binding: ReturnType<typeof useCollectionBinding<'orders'>>;
}

/** Row selection state. Changes when the cashier ticks a row. */
export interface ReportsSelection {
	unselectedRowIds: RowSelectionState;
	setUnselectedRowIds: React.Dispatch<React.SetStateAction<RowSelectionState>>;
}

/** The orders themselves. Rebuilt on every query emission. */
export interface ReportsData {
	allOrders: OrderDocument[];
	selectedOrders: OrderDocument[];
	dateRange: DateRange;
}

/**
 * Split three ways along how often each part changes.
 *
 * `allOrders` and `selectedOrders` are rebuilt on every order-query emission, and the whole
 * bundle was republished with them — so `ReportsSyncProgress`, which reads nothing but
 * `binding`, re-rendered on every emission and on every row the cashier ticked.
 *
 * There is deliberately NO combined context here. Every consumer takes exactly the slice it
 * uses; a combined `useReports()` would be surface with no callers, and the only thing it
 * could do is put back the coupling this split removes.
 */
const ReportsBindingContext = React.createContext<ReportsBinding | undefined>(undefined);
const ReportsSelectionContext = React.createContext<ReportsSelection | undefined>(undefined);
const ReportsDataContext = React.createContext<ReportsData | undefined>(undefined);

/** Just the binding — stable across order emissions and selection changes. */
export const useReportsBinding = (): ReportsBinding => {
	const context = React.useContext(ReportsBindingContext);
	if (!context) {
		throw new Error('useReportsBinding must be used within a ReportsContext');
	}
	return context;
};

/** Just the row selection. */
export const useReportsSelection = (): ReportsSelection => {
	const context = React.useContext(ReportsSelectionContext);
	if (!context) {
		throw new Error('useReportsSelection must be used within a ReportsContext');
	}
	return context;
};

/** The orders and the date range they were filtered by. */
export const useReportsData = (): ReportsData => {
	const context = React.useContext(ReportsDataContext);
	if (!context) {
		throw new Error('useReportsData must be used within a ReportsContext');
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

	const bindingValue = React.useMemo<ReportsBinding>(() => ({ binding }), [binding]);

	const selectionValue = React.useMemo<ReportsSelection>(
		() => ({ unselectedRowIds, setUnselectedRowIds }),
		[unselectedRowIds]
	);

	const dataValue = React.useMemo<ReportsData>(
		() => ({ allOrders, selectedOrders, dateRange }),
		[allOrders, selectedOrders, dateRange]
	);

	return (
		<ReportsBindingContext.Provider value={bindingValue}>
			<ReportsSelectionContext.Provider value={selectionValue}>
				<ReportsDataContext.Provider value={dataValue}>{children}</ReportsDataContext.Provider>
			</ReportsSelectionContext.Provider>
		</ReportsBindingContext.Provider>
	);
}
