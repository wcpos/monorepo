import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { PriceWithTax } from '../../components/product/price-with-tax';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const Price = ({
	table,
	row,
	column,
}: CellContext<{ document: ProductDocument }, 'price'>) => {
	const product = row.original.document;
	const price = useObservableEagerState(product.price$);
	const taxStatus = useObservableEagerState(product.tax_status$);
	const taxClass = useObservableEagerState(product.tax_class$);

	/**
	 *
	 */
	return (
		<PriceWithTax
			price={price}
			taxStatus={taxStatus}
			taxClass={taxClass}
			taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
		/>
	);
};
