import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import useStore from '@wcpos/hooks/src/use-store';
import Table from './table';
import SearchBar from './search-bar';
import UiSettings from '../common/ui-settings';

/**
 *
 */
const Orders = () => {
	const { uiResources } = useStore();
	const ui = useObservableSuspense(uiResources.orders);
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

export default Orders;
