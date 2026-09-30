import * as React from 'react';

import { Chip } from '@wcpos/components/chip';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';

import { useQueryState, useQueryStateActions } from '../../../../query';
import { useT } from '../../../../contexts/translations';

export function DiscountTypePill() {
	const selected = useQueryState<'coupons', string | undefined>(
		(state) => state.filters.discount_type
	);
	const { setFilter, clearFilter } = useQueryStateActions<'coupons'>();
	const t = useT();
	const isActive = !!selected;

	const items = React.useMemo(
		() => [
			{ value: 'percent', label: t('coupons.percent') },
			{ value: 'fixed_cart', label: t('coupons.fixed_cart') },
			{ value: 'fixed_product', label: t('coupons.fixed_product') },
		],
		[t]
	);

	const value = React.useMemo(() => {
		const val = items.find((item) => item.value === selected);
		return val ? val : { value: '', label: '' };
	}, [items, selected]);

	return (
		<Select
			value={value}
			onValueChange={(option) => option && setFilter('discount_type', option.value)}
		>
			<SelectPrimitiveTrigger asChild>
				<Chip
					testID="filter-pill-discount_type"
					clearTestID="filter-pill-remove-discount_type"
					icon="percent"
					label={value?.label || t('coupons.discount_type')}
					on={isActive}
					onClear={isActive ? () => clearFilter('discount_type') : undefined}
				/>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem
						testID={`coupon-filter-type-${item.value}`}
						key={item.value}
						label={item.label}
						value={item.value}
					/>
				))}
			</SelectContent>
		</Select>
	);
}
