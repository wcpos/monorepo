import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import SearchBar from './search-bar';
import Table from './table';
import { t } from '../../../lib/translations';
import AddNewCustomer from '../components/add-new-customer';
import UiSettings from '../components/ui-settings';
import { CustomersProvider } from '../contexts/customers';
import { Query } from '../contexts/query';
import useUI from '../contexts/ui-settings';

/**
 *
 */
const Customers = () => {
	const { uiSettings } = useUI('customers');
	const theme = useTheme();

	/**
	 *
	 */
	const query = React.useMemo(
		() =>
			new Query({
				sortBy: uiSettings.get('sortBy'),
				sortDirection: uiSettings.get('sortDirection'),
			}),
		[uiSettings]
	);

	/**
	 *
	 */
	return (
		<CustomersProvider query={query}>
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
						<SearchBar />
						<AddNewCustomer />
						<UiSettings uiSettings={uiSettings} title={t('Customer Settings', { _tags: 'core' })} />
					</Box>
					<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
						<ErrorBoundary>
							<React.Suspense>
								<Table uiSettings={uiSettings} />
							</React.Suspense>
						</ErrorBoundary>
					</Box>
				</Box>
			</Box>
		</CustomersProvider>
	);
};

export default Customers;
