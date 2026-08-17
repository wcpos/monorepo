import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useCurrencyFormat } from '../../../hooks/use-currency-format';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function COGS({
	table,
	row,
	column,
}: CellContext<
	{ document: ProductDocument; record: EngineRecord<'products'> },
	'cost_of_goods_sold'
>) {
	const cogs = useRecordField(row.original.record, (product) => product.payload.cost_of_goods_sold);
	const cogs_value = cogs?.total_value ?? 0;
	const { format } = useCurrencyFormat();

	return <Text>{format(cogs_value)}</Text>;
}
