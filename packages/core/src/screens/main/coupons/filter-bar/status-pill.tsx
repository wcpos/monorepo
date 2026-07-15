import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';

import { useQueryState, useQueryStateActions } from '../../../../query';
import { useT } from '../../../../contexts/translations';

export function StatusPill() {
	const selected = useQueryState<'coupons', string | undefined>((state) => state.filters.status);
	const { setFilter, clearFilter } = useQueryStateActions<'coupons'>();
	const t = useT();
	const isActive = !!selected;

	const items = React.useMemo(
		() => [
			{ value: 'publish', label: t('coupons.publish') },
			{ value: 'draft', label: t('coupons.draft') },
			{ value: 'pending', label: t('coupons.pending') },
			{ value: 'trash', label: t('coupons.trash') },
		],
		[t]
	);

	const value = React.useMemo(() => {
		const val = items.find((item) => item.value === selected);
		return val ? val : { value: '', label: '' };
	}, [items, selected]);

	return (
		<Select value={value} onValueChange={(option) => option && setFilter('status', option.value)}>
			<SelectPrimitiveTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="circleInfo"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => clearFilter('status')}
				>
					<ButtonText>{value?.label || t('common.status')}</ButtonText>
				</ButtonPill>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.value} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);
}
