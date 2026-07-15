import React from 'react';
import { View } from 'react-native';

import { flexRender } from '@tanstack/react-table';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import type { OrderDocument } from '@wcpos/database';

import { TableHeaderSelect } from './header-select';
import { TableRowSelect } from './row-select';
import { useT } from '../../../../contexts/translations';
import {
	DataTable,
	DataTableFooter,
	DataTableHeader,
	type RenderHeaderProps,
} from '../../components/data-table';
import { DataTableSkeleton } from '../../components/data-table/skeleton';
import { DateCell } from '../../components/date';
import { Cashier } from '../../components/order/cashier';
import { CreatedVia } from '../../components/order/created-via';
import { Customer } from '../../components/order/customer';
import { OrderNumber } from '../../components/order/order-number';
import { PaymentMethod } from '../../components/order/payment-method';
import { Status } from '../../components/order/status';
import { Total } from '../../components/order/total';
import { UISettingsDialog } from '../../components/ui-settings';
import { useReports } from '../context';
import { UISettingsForm } from '../ui-settings-form';
import { TextCell } from '../../components/text-cell';
import { useQueryState, useQueryStateActions } from '../../../../query';

import type { QueryStateActions } from '../../../../query';
import type { RowSelectionState } from '@tanstack/react-table';
import type { Observable } from 'rxjs';

const cells = {
	select: TableRowSelect,
	customer_id: Customer,
	status: Status,
	total: Total,
	date_created_gmt: DateCell,
	date_modified_gmt: DateCell,
	date_completed_gmt: DateCell,
	date_paid_gmt: DateCell,
	payment_method: PaymentMethod,
	created_via: CreatedVia,
	cashier: Cashier,
	number: OrderNumber,
};

function renderCell(columnKey: string, info: Record<string, unknown>) {
	const Renderer = (
		cells as unknown as Record<string, React.ComponentType<Record<string, unknown>>>
	)[columnKey];
	if (Renderer) {
		return <Renderer {...info} />;
	}

	return <TextCell {...(info as unknown as React.ComponentProps<typeof TextCell>)} />;
}

const headers: Record<string, React.ComponentType<Record<string, unknown>>> = {
	select: TableHeaderSelect as unknown as React.ComponentType<Record<string, unknown>>,
};

const renderHeader = (props: RenderHeaderProps) => {
	const Renderer = headers[props.column.id];
	if (Renderer) {
		return <Renderer {...(props as unknown as Record<string, unknown>)} />;
	}

	return (
		<DataTableHeader
			columnId={props.column.id}
			header={flexRender(props.column.columnDef.header, props.getContext())}
			disableSort={!props.column.getCanSort()}
			sortBy={props.sortBy}
			sortDirection={props.sortDirection}
			onSortingChange={props.onSortingChange}
			align={props.column.columnDef.meta?.align}
		/>
	);
};

function ReportsOrdersFooter(props: {
	active$: Observable<boolean>;
	total$: Observable<number>;
	totalSource$: Observable<'coverage' | 'local'>;
	sync: () => Promise<void>;
	count: number;
}) {
	return <DataTableFooter {...props} collectionName="orders" />;
}

/**
 *
 */
export function Orders() {
	const t = useT();
	const state = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	const { binding, allOrders, unselectedRowIds, setUnselectedRowIds } = useReports();
	const tableActions = React.useMemo<
		Pick<QueryStateActions<'orders'>, 'setSort' | 'extendLimit' | 'setFilter'>
	>(
		() => ({
			setSort: actions.setSort,
			// Reports bind the complete resident date window up front; there is no next page.
			extendLimit: () => undefined,
			setFilter: actions.setFilter,
		}),
		[actions]
	);

	/**
	 * Derive the selection state by inverting unselectedRowIds
	 */
	const selectionState = React.useMemo<RowSelectionState>(() => {
		const state: RowSelectionState = {};
		allOrders.forEach((order) => {
			if (order.uuid && !unselectedRowIds[order.uuid]) {
				state[order.uuid] = true;
			}
		});
		return state;
	}, [allOrders, unselectedRowIds]);

	/**
	 * Update unselectedRowIds when row selection changes
	 */
	const handleRowSelectionChange = React.useCallback(
		(updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
			setUnselectedRowIds((prev) => {
				const newSelectionState = typeof updater === 'function' ? updater(selectionState) : updater;

				// Compute the new unselectedRowIds
				const newUnselectedRowIds: Record<string, true> = {};
				allOrders.forEach((order) => {
					if (order.uuid && !newSelectionState[order.uuid]) {
						newUnselectedRowIds[order.uuid] = true;
					}
				});
				return newUnselectedRowIds;
			});
		},
		[allOrders, selectionState, setUnselectedRowIds]
	);

	/**
	 * Toggle all rows selected or unselected
	 */
	const handleToggleAllRowsSelected = React.useCallback(() => {
		if (Object.keys(unselectedRowIds).length === 0) {
			// All rows are selected, so we want to unselect all rows
			setUnselectedRowIds((prev) => {
				const newUnselectedRowIds: Record<string, true> = {};
				allOrders.forEach((order) => {
					if (order.uuid) newUnselectedRowIds[order.uuid] = true;
				});
				return newUnselectedRowIds;
			});
		} else {
			// Some rows are unselected, so we want to select all rows
			setUnselectedRowIds({});
		}
	}, [allOrders, setUnselectedRowIds, unselectedRowIds]);

	/**
	 * Table config
	 */
	const tableConfig = React.useMemo(
		() => ({
			enableRowSelection: true,
			state: {
				rowSelection: selectionState,
			},
			onRowSelectionChange: handleRowSelectionChange,
			meta: {
				totalOrders: allOrders.length,
				toggleAllRowsSelected: handleToggleAllRowsSelected,
			},
			/**
			 * Extra data is needed to force a re-render of FlashList when the selection state changes
			 */
			extraData: {
				selectionState,
			},
		}),
		[allOrders.length, handleToggleAllRowsSelected, handleRowSelectionChange, selectionState]
	);

	/**
	 *
	 */
	return (
		<View className="h-full p-2 pt-0 pr-0">
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<HStack className="justify-end">
						<UISettingsDialog title={t('reports.orders_settings')}>
							<UISettingsForm />
						</UISettingsDialog>
					</HStack>
				</CardHeader>
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense fallback={<DataTableSkeleton id="reports-orders" />}>
							<DataTable<OrderDocument>
								id="reports-orders"
								resource={binding.resource}
								sort={state.sort}
								actions={tableActions}
								active$={binding.active$}
								total$={binding.total$}
								totalSource$={binding.totalSource$}
								sync={binding.sync}
								renderCell={renderCell}
								renderHeader={renderHeader}
								noDataMessage={t('common.no_orders_found')}
								estimatedItemSize={100}
								tableConfig={tableConfig}
								TableFooterComponent={ReportsOrdersFooter}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}
