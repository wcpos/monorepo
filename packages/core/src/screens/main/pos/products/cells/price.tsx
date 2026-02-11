import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { VStack } from '@wcpos/components/vstack';

import { PriceWithTax } from '../../../components/product/price-with-tax';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function Price({ table, row, column }: CellContext<{ document: ProductDocument }, 'price'>) {
	const product = row.original.document;
	const price = useObservableEagerState(product.price$!);
	const regular_price = useObservableEagerState(product.regular_price$!);
	const taxStatus = useObservableEagerState(product.tax_status$!);
	const taxClass = useObservableEagerState(product.tax_class$!);
	const onSale = useObservableEagerState(product.on_sale$!);

	const meta = column.columnDef.meta;
	const show = meta?.show ?? (() => false);
	const showRegularPrice = show('on_sale') && onSale;

	/**
	 *
	 */
	const taxDisplay = show('tax') ? ('text' as const) : ('tooltip' as const);
	const safeTaxStatus = (taxStatus || 'none') as 'taxable' | 'shipping' | 'none';

	return showRegularPrice ? (
		<VStack space="xs" className="justify-end">
			<PriceWithTax
				price={regular_price ?? ''}
				taxStatus={safeTaxStatus}
				taxClass={taxClass ?? ''}
				taxDisplay={taxDisplay}
				strikethrough
			/>
			<PriceWithTax
				price={price ?? ''}
				taxStatus={safeTaxStatus}
				taxClass={taxClass ?? ''}
				taxDisplay={taxDisplay}
			/>
		</VStack>
	) : (
		<PriceWithTax
			price={price ?? ''}
			taxStatus={safeTaxStatus}
			taxClass={taxClass ?? ''}
			taxDisplay={taxDisplay}
		/>
	);
}
