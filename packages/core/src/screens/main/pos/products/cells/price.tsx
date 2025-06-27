import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { VStack } from '@wcpos/components/vstack';

import { PriceWithTax } from '../../../components/product/price-with-tax';

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
	const regular_price = useObservableEagerState(product.regular_price$);
	const taxStatus = useObservableEagerState(product.tax_status$);
	const taxClass = useObservableEagerState(product.tax_class$);
	const onSale = useObservableEagerState(product.on_sale$);

	const showRegularPrice = column.columnDef.meta.show('on_sale') && onSale;

	/**
	 *
	 */
	return showRegularPrice ? (
		<VStack space="xs" className="justify-end">
			<PriceWithTax
				price={regular_price}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
				strikethrough
			/>
			<PriceWithTax
				price={price}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
			/>
		</VStack>
	) : (
		<PriceWithTax
			price={price}
			taxStatus={taxStatus}
			taxClass={taxClass}
			taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
		/>
	);
};
