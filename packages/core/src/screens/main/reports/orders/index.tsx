import React from 'react';
import { View } from 'react-native';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import type { OrderDocument } from '@wcpos/database';

import { TableHeaderSelect } from './header-select';
import { TableRowSelect } from './row-select';
import { useT } from '../../../../contexts/translations';
import { DataTable, DataTableHeader } from '../../components/data-table';
import { Date } from '../../components/date';
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

import type { RowSelectionState } from '@tanstack/react-table';

const cells = {
	select: TableRowSelect,
	customer_id: Customer,
	status: Status,
	total: Total,
	date_created_gmt: Date,
	date_modified_gmt: Date,
	date_completed_gmt: Date,
	date_paid_gmt: Date,
	payment_method: PaymentMethod,
	created_via: CreatedVia,
	cashier: Cashier,
	number: OrderNumber,
};

function renderCell(columnKey: string, info: any) {
	const Renderer = cells[columnKey];
	if (Renderer) {
		return <Renderer {...info} />;
	}

	return <TextCell {...info} />;
}

const headers = {
	select: TableHeaderSelect,
};

const renderHeader = (props) => {
	const Renderer = headers[props.column.id];
	if (Renderer) {
		return <Renderer {...props} />;
	}

	return <DataTableHeader {...props} />;
};

/**
 *
 */
export const Orders = () => {
	const t = useT();
	const { query, allOrders, unselectedRowIds, setUnselectedRowIds } = useReports();

	/**
	 * Derive the selection state by inverting unselectedRowIds
	 */
	const selectionState = React.useMemo<RowSelectionState>(() => {
		const state: RowSelectionState = {};
		allOrders.forEach((order) => {
			if (!unselectedRowIds[order.uuid]) {
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
					if (!newSelectionState[order.uuid]) {
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
					newUnselectedRowIds[order.uuid] = true;
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
						<Suspense>
							<DataTable<OrderDocument>
								id="reports-orders"
								query={query}
								renderCell={renderCell}
								renderHeader={renderHeader}
								noDataMessage={t('common.no_orders_found')}
								estimatedItemSize={100}
								tableState={{ rowSelection: selectionState }}
								tableConfig={tableConfig}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
};
