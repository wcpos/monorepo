import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { getVariablePrices } from './get-variable-prices';
import { PriceWithTax } from './price-with-tax';

import type { VariablePrices } from './get-variable-prices';

type PriceKey = keyof VariablePrices;

/**
 *
 */
export function VariableProductPrice({
	table,
	row,
	column,
}: CellContext<{ record: EngineRecord<'products'> }, 'price' | 'regular_price' | 'sale_price'>) {
	const taxStatus = useRecordField(row.original.record, (product) => product.payload.tax_status);
	const taxClass = useRecordField(row.original.record, (product) => product.payload.tax_class);
	const metaData = useRecordField(row.original.record, (product) => product.payload.meta_data);
	const owner = useRecordField(row.original.record, (product) => ({
		recordId: product.uuid,
		remoteId: product.remoteId,
		name: product.payload.name,
		sku: product.payload.sku,
		price: product.payload.price,
		regularPrice: product.payload.regular_price,
		salePrice: product.payload.sale_price,
	}));
	const variablePrices = getVariablePrices(metaData, owner);
	const key = column.id as PriceKey;
	const safeTaxStatus = taxStatus || 'none';

	if (!variablePrices || !variablePrices[key]) {
		return null;
	}

	const range = variablePrices[key];

	if (range.min === range.max) {
		return (
			<PriceWithTax
				price={range.max}
				taxStatus={safeTaxStatus}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
		);
	}

	return (
		<HStack className="flex-wrap justify-end gap-1">
			<PriceWithTax
				price={range.min}
				taxStatus={safeTaxStatus}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={range.max}
				taxStatus={safeTaxStatus}
				taxClass={taxClass ?? ''}
				taxDisplay={column.columnDef.meta?.show?.('tax') ? 'text' : 'tooltip'}
			/>
		</HStack>
	);
}
