import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { resolveVariationName } from '../../components/product/resolve-variation-name';

/**
 *
 */
export function ProductVariationName({
	row,
	column,
}: CellContext<{ record: EngineRecord<'variations'> }, 'name'>) {
	const variation = useRecordField(row.original.record, ({ payload }) => ({
		// Composed from the variation's OWN attributes, not the served `name` — plugin 1.10.0
		// collapses that to just the parent name at 3+ attributes, and merchants update on their own
		// schedule. See resolveVariationName.
		name: resolveVariationName(payload),
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
