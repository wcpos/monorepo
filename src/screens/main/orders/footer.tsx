import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import SyncButton from '../components/sync-button';
import useOrders from '../contexts/orders';
import useResetOrders from '../contexts/orders/use-reset-orders';
import useTotalCount from '../hooks/use-total-count';

interface OrderFooterProps {
	count: number;
}

const OrdersFooter = ({ count }: OrderFooterProps) => {
	const theme = useTheme();
	const { replicationState, clear, sync } = useOrders();
	const active = useObservableState(replicationState ? replicationState.active$ : of(false), false);
	const total = useTotalCount('orders', replicationState);

	/**
	 *
	 */

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
			<SyncButton sync={sync} clear={clear} active={active} />
		</Box>
	);
};

export default OrdersFooter;
