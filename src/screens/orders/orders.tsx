import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';
import { OrdersProvider } from '@wcpos/hooks/src/use-orders';
import Box from '@wcpos/components/src/box';
import useUIResource from '@wcpos/hooks/src/use-ui-resource';
import Table from './table';
import SearchBar from './search-bar';
import UiSettings from '../common/ui-settings';

type SortDirection = import('@wcpos/components/src/table/table').SortDirection;
type OrderDocument = import('@wcpos/database').OrderDocument;
interface QueryState {
	search: string;
	sortBy: string;
	sortDirection: SortDirection;
}

/**
 *
 */
const Orders = () => {
	const ui = useObservableSuspense(useUIResource('orders'));
	const theme = useTheme();

	return (
		<OrdersProvider initialQuery={{ sortBy: 'date_created_gmt', sortDirection: 'desc' }}>
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
					<Table ui={ui} />
				</Box>
			</Box>
		</OrdersProvider>
	);
};

export default Orders;
