import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { getVariablePrices } from './get-variable-prices';
import { PriceWithTax } from './price-with-tax';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function VariableProductPrice({
	table,
	row,
	column,
}: CellContext<{ document: ProductDocument }, 'price' | 'regular_price' | 'sale_price'>) {
	const product = row.original.document;
	const taxStatus = useObservableState(product.tax_status$!, product.tax_status) as
		| 'none'
		| 'taxable'
		| 'shipping'
		| undefined;
	const taxClass = useObservableState(product.tax_class$!, product.tax_class) as string | undefined;

	const metaData = useObservableState(product.meta_data$!, product.meta_data) as
		| { key?: string; value?: string }[]
		| undefined;
	const variablePrices = getVariablePrices(metaData);

	/**
	 * No variable prices found?!
	 */
	if (variablePrices && !variablePrices[column.id]) {
		return null;
	}

	// min and max exist by are equal
	if (variablePrices[column.id].min === variablePrices[column.id].max) {
		return (
			<PriceWithTax
				price={variablePrices[column.id].max}
				taxStatus={taxStatus ?? 'none'}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
		);
	}

	// default, min and max are different
	return (
		<HStack className="flex-wrap justify-end gap-1">
			<PriceWithTax
				price={variablePrices[column.id].min}
				taxStatus={taxStatus ?? 'none'}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={variablePrices[column.id].max}
				taxStatus={taxStatus ?? 'none'}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
		</HStack>
	);
}
