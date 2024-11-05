import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';

import { Box } from '@wcpos/components/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Suspense } from '@wcpos/components/src/suspense';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';
import { useQuery } from '@wcpos/query';

import { Actions } from './cells/actions';
import { Address } from './cells/address';
import { Avatar } from './cells/avatar';
import { CustomerEmail } from './cells/email';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { Date } from '../components/date';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettingsDialog } from '../components/ui-settings';
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
	const navigation = useNavigation();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['customers'],
		collectionName: 'customers',
		initialParams: {
			sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection }],
		},
		infiniteScroll: true,
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
							className="flex-1"
						/>
						<Tooltip>
							<TooltipTrigger asChild>
								<IconButton name="userPlus" onPress={() => navigation.navigate('AddCustomer')} />
							</TooltipTrigger>
							<TooltipContent>
								<Text>{t('Add new customer', { _tags: 'core' })}</Text>
							</TooltipContent>
						</Tooltip>
						<UISettingsDialog title={t('Customer Settings', { _tags: 'core' })}>
							<UISettingsForm />
						</UISettingsDialog>
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
