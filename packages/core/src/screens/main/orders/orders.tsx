import * as React from 'react';

import get from 'lodash/get';

import { Box } from '@wcpos/components/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
import { VStack } from '@wcpos/components/src/vstack';
import { useQuery } from '@wcpos/query';

import { Actions } from './cells/actions';
import { Address } from './cells/address';
import { Note } from './cells/note';
import { Receipt } from './cells/receipt';
import FilterBar from './filter-bar';
import { UISettingsForm } from './ui-settings-form';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { Date } from '../components/date';
import { Cashier } from '../components/order/cashier';
import { CreatedVia } from '../components/order/created-via';
import { Customer } from '../components/order/customer';
import { OrderNumber } from '../components/order/order-number';
import { PaymentMethod } from '../components/order/payment-method';
import { Status } from '../components/order/status';
import { Total } from '../components/order/total';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettingsDialog } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

type OrderDocument = import('@wcpos/database').OrderDocument;

const cells = {
	actions: Actions,
	billing: Address,
	shipping: Address,
	customer_id: Customer,
	customer_note: Note,
	status: Status,
	total: Total,
	date_created_gmt: Date,
	date_modified_gmt: Date,
	date_completed_gmt: Date,
	date_paid_gmt: Date,
	payment_method: PaymentMethod,
	created_via: CreatedVia,
	cashier: Cashier,
	receipt: Receipt,
	number: OrderNumber,
};

const renderCell = (props) => get(cells, props.column.id);

/**
 *
 */
const Orders = () => {
	const { uiSettings } = useUISettings('orders');
	const t = useT();
	const { wpCredentials, store } = useAppState();

	const selector = {
		$and: [{ meta_data: { $elemMatch: { key: '_pos_user', value: String(wpCredentials?.id) } } }],
	};

	if (store?.id) {
		selector.$and.push({
			meta_data: { $elemMatch: { key: '_pos_store', value: String(store?.id) } },
		});
	} else {
		selector.created_via = 'woocommerce-pos';
	}

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['orders'],
		collectionName: 'orders',
		initialParams: {
			sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection }],
			selector,
		},
		infiniteScroll: true,
	});

	/**
	 *
	 */
	return (
		<Box className="p-2 h-full">
			<Card className="flex-1">
				<CardHeader className="p-2 bg-input">
					<VStack>
						<HStack>
							<QuerySearchInput
								query={query}
								placeholder={t('Search Orders', { _tags: 'core' })}
								className="flex-1"
							/>
							<UISettingsDialog title={t('Order Settings', { _tags: 'core' })}>
								<UISettingsForm />
							</UISettingsDialog>
						</HStack>
						<ErrorBoundary>
							<FilterBar query={query} />
						</ErrorBoundary>
					</VStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<OrderDocument>
								id="orders"
								query={query}
								renderCell={renderCell}
								noDataMessage={t('No orders found', { _tags: 'core' })}
								estimatedItemSize={100}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</Box>
	);
};

export default Orders;
