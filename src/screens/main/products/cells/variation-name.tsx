import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export const ProductVariationName = ({
	row,
	column,
}: CellContext<{ document: ProductVariationDocument }, 'name'>) => {
	const variation = row.original.document;
	const { show } = column.columnDef.meta;

	/**
	 *
	 */

	return (
		<VStack space="xs">
			<Text className="font-bold">{variation.name}</Text>
			{show('sku') && <Text className="text-sm">{variation.sku}</Text>}
			{show('barcode') && <Text className="text-sm">{variation.barcode}</Text>}
		</VStack>
	);
};
