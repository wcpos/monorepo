import * as React from 'react';

import get from 'lodash/get';

import { Box } from '@wcpos/components/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
import type { OrderDocument } from '@wcpos/database';

import { TableHeaderSelect } from './header-select';
import { TableRowSelect } from './row-select';
import { useT } from '../../../../contexts/translations';
import { DataTable } from '../../components/data-table';
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

const renderCell = (props) => get(cells, props.column.id);

const headers = {
	select: TableHeaderSelect,
};

const renderHeader = (props) => get(headers, props.column.id);

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
	 *
	 */
	return (
		<Box className="p-2 pt-0 pr-0 h-full">
			<Card className="flex-1">
				<CardHeader className="p-2 bg-input">
					<HStack className="justify-end">
						<UISettingsDialog title={t('Orders Settings', { _tags: 'core' })}>
							<UISettingsForm />
						</UISettingsDialog>
					</HStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<OrderDocument>
								id="reports-orders"
								query={query}
								renderCell={renderCell}
								renderHeader={renderHeader}
								noDataMessage={t('No orders found', { _tags: 'core' })}
								estimatedItemSize={100}
								enableRowSelection
								tableState={{ rowSelection: selectionState }}
								onRowSelectionChange={handleRowSelectionChange}
								extraData={unselectedRowIds}
								tableMeta={{
									totalOrders: allOrders.length,
									toggleAllRowsSelected: handleToggleAllRowsSelected,
								}}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</Box>
	);
};
