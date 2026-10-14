import * as React from 'react';
import { View } from 'react-native';

import type { CellContext } from '@wcpos/core/table-types';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { OptionChips } from '../v2/option-chips';
import { StockQuantity } from './stock-quantity';
import { resolveVariationName } from '../../../components/product/resolve-variation-name';

/**
 *
 */
export function ProductVariationName(
	props: CellContext<{ record: EngineRecord<'variations'> }, 'name'>
) {
	const { row, column } = props;
	const t = useT();
	const variation = useRecordField(row.original.record, ({ payload }) => ({
		// Composed from the variation's OWN attributes, not the served `name` — plugin 1.10.0
		// collapses that to just the parent name at 3+ attributes, and merchants update on their own
		// schedule. See resolveVariationName.
		name: resolveVariationName(payload),
		attributes: payload.attributes,
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
			<OptionChips attributes={variation.attributes} fallback={variation.name} />
			<View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-px">
				{show('stock_quantity') && <StockQuantity {...props} />}
				{show('sku') && !!variation.sku && (
					<Text className="text-sm">
						<Text className="text-muted-foreground">{t('common.sku')} </Text>
						{variation.sku}
					</Text>
				)}
				{show('barcode') && !!variation.barcode && (
					<Text className="text-sm">{variation.barcode}</Text>
				)}
			</View>
		</VStack>
	);
}
