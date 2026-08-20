import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export function PaymentMethod({
	row,
}: CellContext<{ document: OrderDocument; record: EngineRecord<'orders'> }, 'payment_method'>) {
	const paymentMethodTitle = useRecordField(
		row.original.record,
		({ payload }) => payload.payment_method_title
	);

	return paymentMethodTitle ? <Text>{paymentMethodTitle}</Text> : null;
}
