import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { Text } from '@wcpos/components/text';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export const CustomerEmail = ({ row }: CellContext<{ document: CustomerDocument }, 'email'>) => {
	const customer = row.original.document;
	const email = useObservableEagerState(customer.email$ ?? of(undefined as string | undefined));

	return <Text numberOfLines={1}>{email}</Text>;
};
