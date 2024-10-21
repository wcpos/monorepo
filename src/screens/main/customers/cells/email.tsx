import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export const CustomerEmail = ({ row }: CellContext<{ document: CustomerDocument }, 'email'>) => {
	const customer = row.original.document;
	const email = useObservableEagerState(customer.email$);

	return <Text numberOfLines={1}>{email}</Text>;
};
