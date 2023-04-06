import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import SyncButton from '../components/sync-button';
import useCustomers from '../contexts/customers';
import useCollection from '../hooks/use-collection';

interface CustomersFooterProps {
	count: number;
}

const CustomersFooter = ({ count }: CustomersFooterProps) => {
	const theme = useTheme();
	const { sync, clear, replicationState } = useCustomers();
	const active = useObservableState(replicationState ? replicationState.active$ : of(false), false);
	const collection = useCollection('customers');
	const total = useObservableState(
		collection.getLocal$('audit-customers').pipe(
			map((result) => {
				const data = result?.toJSON().data;
				return data?.remoteIDs ? data.remoteIDs.length : 0;
			})
		),
		0
	);

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

export default CustomersFooter;
