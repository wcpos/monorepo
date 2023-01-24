import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import SearchBar from './search-bar';
import Table from './table';
import { CustomersProvider } from '../../../../contexts/customers';
import useUI from '../../../../contexts/ui';
import AddNewCustomer from '../../common/add-new-customer';
import UiSettings from '../../common/ui-settings';

/**
 *
 */
const Customers = () => {
	const { ui } = useUI('customers');
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

const WrappedCustomers = () => {
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading customers UI</Text>}>
				<Customers />
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default WrappedCustomers;
