import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import SyncButton from '../components/sync-button';
import { useOrders } from '../contexts/orders';

interface OrderFooterProps {
	count: number;
}

const OrdersFooter = ({ count, total, loading }: OrderFooterProps) => {
	const theme = useTheme();
	const { clear, sync } = useOrders();

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
			<SyncButton sync={sync} clear={clear} active={loading} />
		</Box>
	);
};

export default OrdersFooter;
