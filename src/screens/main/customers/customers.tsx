import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';
import { CustomersProvider } from '@wcpos/core/src/contexts/customers';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import useStore from '@wcpos/hooks/src/use-store';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table from './table';
import SearchBar from './search-bar';
import UiSettings from '../common/ui-settings';
import AddNewCustomer from '../common/add-new-customer';

/**
 *
 */
const Customers = () => {
	const { uiResources } = useStore();
	const ui = useObservableSuspense(uiResources.customers);
	const theme = useTheme();

	return (
		<CustomersProvider initialQuery={{ sortBy: 'last_name', sortDirection: 'asc' }}>
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
						<UiSettings ui={ui} />
					</Box>
					<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
						<ErrorBoundary>
							<React.Suspense fallback={<Text>Loading Customers Table</Text>}>
								<Table ui={ui} />
							</React.Suspense>
						</ErrorBoundary>
					</Box>
				</Box>
			</Box>
		</CustomersProvider>
	);
};

export default Customers;
