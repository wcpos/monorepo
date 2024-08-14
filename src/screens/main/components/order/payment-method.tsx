import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import type { CellContext } from '@wcpos/tailwind/src/data-table';
import { Text } from '@wcpos/tailwind/src/text';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const PaymentMethod = ({ row }: CellContext<OrderDocument, 'payment_method'>) => {
	const order = row.original;
	const paymentMethodTitle = useObservableEagerState(order.payment_method_title$);

	return paymentMethodTitle ? <Text>{paymentMethodTitle}</Text> : null;
};
