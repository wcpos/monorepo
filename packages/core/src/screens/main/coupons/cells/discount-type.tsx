import { Chip } from '@wcpos/components/chip';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { discountTypeLabel } from '../discount-type-label';

export function DiscountType({
	row,
	table,
}: CellContext<{ record: EngineRecord<'coupons'> }, 'discount_type'>) {
	const discountType =
		useRecordField(row.original.record, ({ payload }) => payload.discount_type) ?? 'percent';
	const t = useT();
	const actions = table.options.meta?.actions;

	const label = discountTypeLabel(discountType, t);

	return (
		<Chip
			size="sm"
			label={label}
			onPress={() => actions?.setFilter('discount_type', discountType)}
		/>
	);
}
