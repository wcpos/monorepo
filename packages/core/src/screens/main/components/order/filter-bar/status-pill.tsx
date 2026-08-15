import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';

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
				<ButtonPill
					testID="order-filter-status"
					size="xs"
					leftIcon="cartCircleCheck"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => actions.clearFilter('status')}
				>
					<ButtonText>{value?.label || t('common.status')}</ButtonText>
				</ButtonPill>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.label} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);
}
