import * as React from 'react';
import { useTheme } from 'styled-components/native';
import { useObservableState } from 'observable-hooks';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import useStore from '@wcpos/hooks/src/use-store';

interface OrderFooterProps {
	count: number;
}

const OrdersFooter = ({ count }: OrderFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.orders.totalDocCount$, 0);
	const theme = useTheme();

	return (
		<Box
			padding="small"
			align="end"
			style={{
				backgroundColor: theme.colors.lightGrey,
				borderBottomLeftRadius: theme.rounding.medium,
				borderBottomRightRadius: theme.rounding.medium,
			}}
		>
			<Text size="small">
				Showing {count} of {total}
			</Text>
		</Box>
	);
};

export default OrdersFooter;
