import * as React from 'react';
import { View } from 'react-native';

import type { CellContext } from '@wcpos/core/table-types';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { OptionChips } from '../option-chips';
import { StockQuantity } from './stock-quantity';
import { resolveVariationName } from '../../../components/product/resolve-variation-name';

/**
 * The parent product's name, for the rows of a drilled-in variations pane: a row of bare
 * option chips has no noun, and the crumb is above the card, not beside the row. Provided by
 * the pane only; the inline rows under a parent row in the products table (same cell) leave it
 * unset, since the parent's row is the line above. The grid's variation tile prints the same
 * line above its chips.
 */
export const VariationParentNameContext = React.createContext<string | undefined>(undefined);

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
	const parentName = React.useContext(VariationParentNameContext);

	/**
	 * Sometimes the product name from WooCommerce is encoded in html entities
	 */
	return (
		<VStack space="xs">
			{!!parentName && (
				<Text variant="help" numberOfLines={1} decodeHtml testID="variation-parent-name">
					{parentName}
				</Text>
			)}
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
