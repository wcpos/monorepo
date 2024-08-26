import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import type { CellContext } from '@tanstack/react-table';
import { Text } from '@wcpos/components/src/text';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export const CustomerEmail = ({ row }: CellContext<CustomerDocument, 'email'>) => {
	const customer = row.original;
	const email = useObservableEagerState(customer.email$);

	return <Text numberOfLines={1}>{email}</Text>;
};
