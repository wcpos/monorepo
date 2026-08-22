import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

/**
 *
 */
export function ProductVariationName({
	row,
	column,
}: CellContext<{ record: EngineRecord<'variations'> }, 'name'>) {
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
			<Text className="font-bold" decodeHtml>
				{variation.name}
			</Text>
			{show?.('sku') && <Text className="text-sm">{variation.sku}</Text>}
			{show?.('barcode') && <Text className="text-sm">{variation.barcode}</Text>}
		</VStack>
	);
}
