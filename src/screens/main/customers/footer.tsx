import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import useStore from '../../../contexts/store';
// import useCustomers from '@wcpos/hooks/src/use-customers';

interface CustomersFooterProps {
	count: number;
}

const CustomersFooter = ({ count }: CustomersFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.customers.totalDocCount$, 0);
	const theme = useTheme();
	// const { runReplication } = useCustomers();

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
			<Button type="secondary" size="small" background="outline" onPress={() => {}}>
				<Icon name="arrowRotateRight" size="small" />
			</Button>
		</Box>
	);
};

export default CustomersFooter;
