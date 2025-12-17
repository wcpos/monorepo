import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import get from 'lodash/get';

import { CurrencyInput } from '../../components/currency-input';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function COGS({
	table,
	row,
}: CellContext<{ document: ProductDocument }, 'cost_of_goods_sold'>) {
	const product = row.original.document;
	const cogs = useObservableEagerState(product.cost_of_goods_sold$);
	const defined_value = get(cogs, ['values', 0, 'defined_value'], 0);

	/**
	 *
	 */
	return (
		<CurrencyInput
			value={defined_value}
			onChangeText={(newValue) => {
				// Construct a plain object update (RxDB Proxy objects can't be cloned)
				const updatedCogs = {
					total_value: cogs?.total_value ?? 0,
					values: [
						{
							defined_value: newValue,
							effective_value: cogs?.values?.[0]?.effective_value ?? 0,
						},
					],
				};
				table.options.meta.onChange({
					document: product,
					changes: { cost_of_goods_sold: updatedCogs },
				});
			}}
		/>
	);
}
