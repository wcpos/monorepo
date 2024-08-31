import * as React from 'react';

import get from 'lodash/get';

import { Box } from '@wcpos/components/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { TableRowSelect } from './cells/select';
import { TableHeaderSelect } from './headers/select';
import { UISettingsForm } from './ui-settings-form';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { Date } from '../components/date';
import { Cashier } from '../components/order/cashier';
import { CreatedVia } from '../components/order/created-via';
import { Customer } from '../components/order/customer';
import { PaymentMethod } from '../components/order/payment-method';
import { Status } from '../components/order/status';
import { Total } from '../components/order/total';
import { UISettingsDialog } from '../components/ui-settings';

type OrderDocument = import('@wcpos/database').OrderDocument;

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
};

const renderCell = (props) => get(cells, props.column.id);

const headers = {
	select: TableHeaderSelect,
};

const renderHeader = (props) => get(headers, props.column.id);

/**
 *
 */
export const Orders = ({ query }) => {
	const t = useT();
	const [rowSelection, setRowSelection] = React.useState({});

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
								tableState={{ rowSelection }}
								onRowSelectionChange={setRowSelection}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</Box>
	);
};
