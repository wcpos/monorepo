import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import cells from './cells';
import SearchBar from './search-bar';
import { useT } from '../../../contexts/translations';
import { AddNewCustomer } from '../components/customer/add-new';
import DataTable from '../components/data-table';
import UiSettings from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
const Customers = () => {
	const { uiSettings } = useUISettings('customers');
	const theme = useTheme();
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
		<Box padding="small" style={{ height: '100%' }}>
			<Box
				raised
				rounding="medium"
				style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
			>
				<Box
					horizontal
					space="small"
					padding="small"
					align="center"
					style={{
						backgroundColor: theme.colors.grey,
						borderTopLeftRadius: theme.rounding.medium,
						borderTopRightRadius: theme.rounding.medium,
					}}
				>
					<SearchBar query={query} />
					<AddNewCustomer />
					<UiSettings uiSettings={uiSettings} title={t('Customer Settings', { _tags: 'core' })} />
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
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
				</Box>
			</Box>
		</Box>
	);
};

export default Customers;
