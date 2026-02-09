import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

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
}: CellContext<{ document: ProductDocument }, 'cost_of_goods_sold'>) {
	const product = row.original.document;
	const cogs = useObservableEagerState(product.cost_of_goods_sold$!);
	const cogs_value = cogs?.total_value || 0;
	const { format } = useCurrencyFormat();

	return <Text>{format(cogs_value)}</Text>;
}
