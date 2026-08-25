import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { StockQuantity } from './stock-quantity';
import { resolveVariationName } from '../../../components/product/resolve-variation-name';

/**
 *
 */
export function ProductVariationName(
	props: CellContext<{ record: EngineRecord<'variations'> }, 'name'>
) {
	const { row, column } = props;
	const variation = useRecordField(row.original.record, ({ payload }) => ({
		// Composed from the variation's OWN attributes, not the served `name` — plugin 1.10.0
		// collapses that to just the parent name at 3+ attributes, and merchants update on their own
		// schedule. See resolveVariationName.
		name: resolveVariationName(payload),
		sku: payload.sku,
		barcode: payload.barcode,
	}));
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
