import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { getVariablePrices } from './get-variable-prices';
import { PriceWithTax } from './price-with-tax';

import type { CellContext } from '@tanstack/react-table';
import type { VariablePrices } from './get-variable-prices';

type ProductDocument = import('@wcpos/database').ProductDocument;
type PriceKey = keyof VariablePrices;

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
	const key = column.id as PriceKey;

	if (!variablePrices || !variablePrices[key]) {
		return null;
	}

	const range = variablePrices[key];

	if (range.min === range.max) {
		return (
			<PriceWithTax
				price={range.max}
				taxStatus={taxStatus ?? 'none'}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
		);
	}

	return (
		<HStack className="flex-wrap justify-end gap-1">
			<PriceWithTax
				price={range.min}
				taxStatus={taxStatus ?? 'none'}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={range.max}
				taxStatus={taxStatus ?? 'none'}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
		</HStack>
	);
}
