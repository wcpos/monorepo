import * as React from 'react';

import get from 'lodash/get';

import { useQuery } from '@wcpos/query';
import { Box } from '@wcpos/components/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';

import { Actions } from './cells/actions';
import { Address } from './cells/address';
import { Avatar } from './cells/avatar';
import { CustomerEmail } from './cells/email';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { AddNewCustomer } from '../components/customer/add-new';
import { DataTable } from '../components/data-table';
import { Date } from '../components/date';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettingsButton } from '../components/ui-settings/button';
import { useUISettings } from '../contexts/ui-settings';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

const cells = {
	avatar_url: Avatar,
	billing: Address,
	shipping: Address,
	actions: Actions,
	email: CustomerEmail,
	date_created_gmt: Date,
	date_modified_gmt: Date,
};

const renderCell = (props) => get(cells, props.column.id);

/**
 *
 */
const Customers = () => {
	const { uiSettings } = useUISettings('customers');
	const t = useT();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['customers'],
		collectionName: 'customers',
		initialParams: {
			sortBy: uiSettings.sortBy,
			sortDirection: uiSettings.sortDirection,
		},
	});

	/**
	 *
	 */
	return (
		<Box className="h-full p-2">
			<Card className="flex-1">
				<CardHeader className="p-0 bg-input">
					<HStack className="p-2">
						<QuerySearchInput
							query={query}
							placeholder={t('Search Customers', { _tags: 'core' })}
						/>
						<AddNewCustomer />
						<UISettingsButton title={t('Customer Settings', { _tags: 'core' })}>
							<UISettingsForm />
						</UISettingsButton>
					</HStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<CustomerDocument>
								id="customers"
								query={query}
								renderCell={renderCell}
								noDataMessage={t('No customers found', { _tags: 'core' })}
								estimatedItemSize={100}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</Box>
	);
};

export default Customers;
