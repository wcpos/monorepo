import React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';
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
export const Orders = () => {
	const { uiSettings } = useUISettings('orders');
	const t = useT();
	const { wpCredentials, store } = useAppState();
	const { bottom } = useSafeAreaInsets();

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
		<View className="h-full p-2" style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}>
			<Card className="flex-1">
				<CardHeader className="bg-input p-2">
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
		</View>
	);
};
