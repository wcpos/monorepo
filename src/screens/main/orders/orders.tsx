import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import { OrdersProvider } from '../../../contexts/orders';
import useUI from '../../../contexts/ui';
import UiSettings from '../common/ui-settings';
import SearchBar from './search-bar';
import Table from './table';

/**
 *
 */
const Orders = () => {
	const { ui } = useUI('orders');
	const theme = useTheme();

	return (
		<OrdersProvider initialQuery={{ sortBy: 'date_created_gmt', sortDirection: 'desc' }}>
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
						<UiSettings ui={ui} />
					</Box>
					<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
						<React.Suspense fallback={<Text>Loading orders table...</Text>}>
							<Table ui={ui} />
						</React.Suspense>
					</Box>
				</Box>
			</Box>
		</OrdersProvider>
	);
};

const WrappedOrders = (props) => {
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading orders UI</Text>}>
				<Orders {...props} />
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default WrappedOrders;
