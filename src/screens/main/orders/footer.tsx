import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useStore from '../../../contexts/store';
import SyncButton from '../components/sync-button';
import useOrders from '../contexts/orders';

interface OrderFooterProps {
	count: number;
}

const OrdersFooter = ({ count }: OrderFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.orders.count().$, 0);
	const theme = useTheme();
	const { sync, clear } = useOrders();

	return (
		<Box
			horizontal
			padding="small"
			space="small"
			align="center"
			distribution="end"
			style={{
				backgroundColor: theme.colors.lightGrey,
				borderBottomLeftRadius: theme.rounding.medium,
				borderBottomRightRadius: theme.rounding.medium,
			}}
		>
			<Text size="small">
				Showing {count} of {total}
			</Text>
			<SyncButton sync={sync} clear={clear} />
		</Box>
	);
};

export default OrdersFooter;
