import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { CurrencyInput } from '../../components/currency-input';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export const EditablePrice = ({
	row,
	column,
	table,
}: CellContext<ProductDocument | ProductVariationDocument, 'sale_price' | 'regular_price'>) => {
	const item = row.original;
	const price = useObservableEagerState(item[`${column.id}$`]) as string;

	/**
	 *
	 */
	return (
		<CurrencyInput
			value={price}
			onChangeText={(price) =>
				table.options.meta.onChange({ row, changes: { [column.id]: String(price) } })
			}
			disabled={column.id === 'sale_price' && !item.on_sale}
		/>
	);
};
