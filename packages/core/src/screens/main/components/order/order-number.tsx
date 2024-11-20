import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const OrderNumber = ({
	row,
}: CellContext<{ document: OrderDocument }, 'payment_method'>) => {
	const order = row.original.document;
	const number = useObservableEagerState(order.number$);

	return number ? <Text>{number}</Text> : null;
};
