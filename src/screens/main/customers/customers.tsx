import * as React from 'react';

import { useQuery } from '@wcpos/query';
import { Box } from '@wcpos/tailwind/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/tailwind/src/card';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Suspense } from '@wcpos/tailwind/src/suspense';

import cells from './cells';
import { useT } from '../../../contexts/translations';
import { AddNewCustomer } from '../components/customer/add-new';
import { DataTable } from '../components/data-table';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettings } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

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
						<UISettings uiSettings={uiSettings} title={t('Customer Settings', { _tags: 'core' })} />
					</HStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<CustomerDocument>
								id="customers"
								query={query}
								cells={cells}
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
