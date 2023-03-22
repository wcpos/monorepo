import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useLocalData from '../../../contexts/local-data';
import SyncButton from '../components/sync-button';
import useCustomers from '../contexts/customers';

interface CustomersFooterProps {
	count: number;
}

const CustomersFooter = ({ count }: CustomersFooterProps) => {
	const { storeDB } = useLocalData();
	const total = useObservableState(storeDB.customers.count().$, 0);
	const theme = useTheme();
	const { sync, clear, replicationState } = useCustomers();

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
			<SyncButton sync={sync} clear={clear} active$={replicationState.active$} />
		</Box>
	);
};

export default CustomersFooter;
