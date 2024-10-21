import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useDataTable } from '@wcpos/components/src/data-table';

import { PriceWithTax } from '../../components/product/price-with-tax';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const Price = ({ row, column }: CellContext<{ document: ProductDocument }, 'price'>) => {
	const product = row.original.document;
	const price = useObservableEagerState(product.price$);
	const taxStatus = useObservableEagerState(product.tax_status$);
	const taxClass = useObservableEagerState(product.tax_class$);
	const context = useDataTable();

	/**
	 *
	 */
	return (
		<PriceWithTax
			price={price}
			taxStatus={taxStatus}
			taxClass={taxClass}
			taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
			taxLocation={context?.taxLocation}
		/>
	);
};
