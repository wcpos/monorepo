import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import Actions from './cells/actions';
import Address from './cells/address';
import CustomerNote from './cells/note';
import FilterBar from './filter-bar';
import SearchBar from './search-bar';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import DataTable from '../components/data-table';
import { Date } from '../components/date';
import { Cashier } from '../components/order/cashier';
import { CreatedVia } from '../components/order/created-via';
import Customer from '../components/order/customer';
import PaymentMethod from '../components/order/payment-method';
import Status from '../components/order/status';
import Total from '../components/order/total';
import UiSettings from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

type OrderDocument = import('@wcpos/database').OrderDocument;

const cells = {
	actions: Actions,
	billing: Address,
	shipping: Address,
	customer_id: Customer,
	customer_note: CustomerNote,
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

/**
 *
 */
const Orders = () => {
	const { uiSettings } = useUISettings('orders');
	const theme = useTheme();
	const t = useT();
	const { wpCredentials, store } = useAppState();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['orders'],
		collectionName: 'orders',
		initialParams: {
			sortBy: uiSettings.sortBy,
			sortDirection: uiSettings.sortDirection,
			selector: {
				$and: [
					{ meta_data: { $elemMatch: { key: '_pos_user', value: String(wpCredentials?.id) } } },
					{ meta_data: { $elemMatch: { key: '_pos_store', value: String(store?.id) } } },
				],
			},
		},
	});

	/**
	 *
	 */
	return (
		<Box padding="small" style={{ height: '100%' }}>
			<Box
				raised
				rounding="medium"
				style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
			>
				<Box
					horizontal
					style={{
						backgroundColor: theme.colors.grey,
						borderTopLeftRadius: theme.rounding.medium,
						borderTopRightRadius: theme.rounding.medium,
					}}
				>
					<Box fill space="small">
						<Box horizontal align="center" padding="small" paddingBottom="none" space="small">
							<ErrorBoundary>
								<SearchBar query={query} />
							</ErrorBoundary>
							<ErrorBoundary>
								<UiSettings
									uiSettings={uiSettings}
									title={t('Order Settings', { _tags: 'core' })}
								/>
							</ErrorBoundary>
						</Box>
						<Box horizontal padding="small" paddingTop="none">
							<FilterBar query={query} />
						</Box>
					</Box>
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<ErrorBoundary>
						<Suspense>
							<DataTable<OrderDocument>
								id="orders"
								query={query}
								cells={cells}
								noDataMessage={t('No orders found', { _tags: 'core' })}
								estimatedItemSize={100}
							/>
						</Suspense>
					</ErrorBoundary>
				</Box>
			</Box>
		</Box>
	);
};

export default Orders;
