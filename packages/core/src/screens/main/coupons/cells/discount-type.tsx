import { Chip } from '@wcpos/components/chip';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

const labelMap: Record<string, string> = {
	percent: 'coupons.percent_short',
	fixed_cart: 'coupons.fixed_cart_short',
	fixed_product: 'coupons.fixed_product_short',
};

export function DiscountType({
	row,
	table,
}: CellContext<{ record: EngineRecord<'coupons'> }, 'discount_type'>) {
	const discountType =
		useRecordField(row.original.record, ({ payload }) => payload.discount_type) ?? 'percent';
	const t = useT();
	const actions = table.options.meta?.actions;

	const label = labelMap[discountType] ? t(labelMap[discountType]) : discountType;

	return (
		<Chip
			size="sm"
			label={label}
			onPress={() => actions?.setFilter('discount_type', discountType)}
		/>
	);
}
