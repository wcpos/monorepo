import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { StockQuantity } from './stock-quantity';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export function ProductVariationName(
	props: CellContext<{ document: ProductVariationDocument }, 'name'>
) {
	const { row, column } = props;
	const variation = row.original.document;
	const meta = column.columnDef.meta;
	const show = meta?.show ?? (() => false);

	/**
	 * Sometimes the product name from WooCommerce is encoded in html entities
	 */
	return (
		<VStack space="xs">
			<Text className="font-bold" decodeHtml>
				{variation.name}
			</Text>
			{show('sku') && <Text className="text-sm">{variation.sku}</Text>}
			{show('barcode') && <Text className="text-sm">{variation.barcode}</Text>}
			{/* @ts-expect-error: CellContext column type differs but StockQuantity only uses row */}
			{show('stock_quantity') && <StockQuantity {...props} className="text-sm" withText />}
		</VStack>
	);
}
