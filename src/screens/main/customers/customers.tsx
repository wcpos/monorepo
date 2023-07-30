import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';

import cells from './cells';
import SearchBar from './search-bar';
import { useQuery } from '../../../contexts/store-state-manager';
import { t } from '../../../lib/translations';
import AddNewCustomer from '../components/add-new-customer';
import DataTable from '../components/data-table';
import UiSettings from '../components/ui-settings';
import useUI from '../contexts/ui-settings';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
const Customers = () => {
	const { uiSettings } = useUI('customers');
	const theme = useTheme();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['customers'],
		collectionName: 'customers',
		initialQuery: {
			sortBy: uiSettings.get('sortBy'),
			sortDirection: uiSettings.get('sortDirection'),
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
								query={query}
								uiSettings={uiSettings}
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
