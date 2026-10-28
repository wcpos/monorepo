import * as React from 'react';
import { View } from 'react-native';

import { SwitchWithLabel } from '@wcpos/components/switch';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { QuantityInput } from '../../components/quantity-input';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

/**
 *
 */
export function StockQuantity({
	row,
	table,
}: CellContext<
	{
		record: EngineRecord<'products'> | EngineRecord<'variations'>;
	},
	'stock_quantity'
>) {
	const product = row.original.record;
	const stockQuantity = useRecordField(
		row.original.record,
		(record) => record.payload.stock_quantity
	);
	const manageStock = useRecordField(row.original.record, (record) => record.payload.manage_stock);
	const type = useRecordField(row.original.record, (record) => record.payload.type);
	const t = useT();
	const commit = table.options.meta?.commit;
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = type === 'variation' ? caps.canEditVariations : caps.canEditProducts;
	const disabled = readOnly || !canEdit;

	return (
		<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
			<VStack>
				<View className="flex-row justify-center">
					{/* Web: the cart's quantity keypad as a count (no `onRemove`: − stops at 0, a
					    typed 0 commits), whole numbers as WooCommerce stores stock; the box keeps
					    the field's width and padding so the row does not reflow. */}
					<QuantityInput
						testID="stock-quantity-input"
						value={stockQuantity ?? 0}
						decimals={0}
						className="web:px-3 w-full"
						// Whether it was saved: the keypad takes a refused − or + back.
						onChangeText={(stock_quantity) =>
							commit?.({ document: product, changes: { stock_quantity } })
						}
						disabled={disabled || !manageStock}
					/>
				</View>
				<SwitchWithLabel
					nativeID="manage_stock"
					label={t('products.manage')}
					checked={manageStock ?? false}
					onCheckedChange={(manage_stock) => {
						if (!disabled) {
							void commit?.({ document: product, changes: { manage_stock } });
						}
					}}
					size="sm"
					disabled={disabled}
				/>
			</VStack>
		</CapabilityTooltip>
	);
}
