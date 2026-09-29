import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';

import { FilterChip as Chip } from './chip';
import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';
import { useOrderStatusLabel } from '../../../hooks/use-order-status-label';

/**
 *
 */
export function StatusPill() {
	const selected = useQueryState<'orders', string | undefined>((state) => state.filters.status);
	const actions = useQueryStateActions<'orders'>();
	const t = useT();
	const isActive = !!selected;
	const { items } = useOrderStatusLabel();
	const value = items.find((item) => item.value === (selected as unknown as string));

	/**
	 *
	 */
	return (
		<Select
			value={value}
			onValueChange={(option) => option && actions.setFilter('status', option.value)}
		>
			<SelectPrimitiveTrigger asChild>
				<Chip
					clearLabel={t('common.remove')}
					clearTestID="order-filter-status-remove"
					testID="order-filter-status"
					icon="cartCircleCheck"
					on={isActive}
					onClear={isActive ? () => actions.clearFilter('status') : undefined}
					label={value?.label || t('common.status')}
				/>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.value} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);
}
