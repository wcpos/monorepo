import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import StockQuantity from './stock-quantity';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export const ProductVariationName = ({
	row,
	column,
}: CellContext<ProductVariationDocument, 'name'>) => {
	const variation = row.original;
	const { show } = column.columnDef.meta;

	/**
	 *
	 */

	return (
		<VStack space="xs">
			<Text className="font-bold">{variation.name}</Text>
			{show('sku') && <Text className="text-sm">{variation.sku}</Text>}
			{show('barcode') && <Text className="text-sm">{variation.barcode}</Text>}
			{show('stock_quantity') && <StockQuantity row={row} className="text-sm" />}
		</VStack>
	);
};
