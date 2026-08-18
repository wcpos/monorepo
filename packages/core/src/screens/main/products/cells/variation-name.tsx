import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export function ProductVariationName({
	row,
	column,
}: CellContext<
	{ document: ProductVariationDocument; record: EngineRecord<'variations'> },
	'name'
>) {
	const variation = useRecordField(row.original.record, ({ payload }) => ({
		name: payload.name,
		sku: payload.sku,
		barcode: payload.barcode,
	}));
	const show = column.columnDef.meta?.show;

	/**
	 *
	 */

	return (
		<VStack space="xs">
			<Text className="font-bold">{variation.name}</Text>
			{show?.('sku') && <Text className="text-sm">{variation.sku}</Text>}
			{show?.('barcode') && <Text className="text-sm">{variation.barcode}</Text>}
		</VStack>
	);
}
