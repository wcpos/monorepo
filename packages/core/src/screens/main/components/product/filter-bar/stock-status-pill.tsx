import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';

import { useT } from '../../../../../contexts/translations';
import { useStockStatusLabel } from '../../../hooks/use-stock-status-label';
import { useQueryState, useQueryStateActions } from '../../../../../query';

/**
 *
 */
export function StockStatusPill() {
	const selected = useQueryState<'products', string | undefined>(
		(state) => state.filters.stock_status
	);
	const actions = useQueryStateActions<'products'>();
	const t = useT();
	const isActive = !!selected;
	const { items } = useStockStatusLabel();

	/**
	 * NOTE: if value changes from { value: 'example', label: 'example' } to undefined,
	 * it won't clear the previous value, so we need to make sure we return { value: '', label: '' }
	 */
	const value = React.useMemo(() => {
		const val = items.find((item) => item.value === selected);
		return val ? val : { value: '', label: '' };
	}, [items, selected]);

	/**
	 *
	 */
	return (
		<Select
			value={value}
			onValueChange={(option) => option && actions.setFilter('stock_status', option.value)}
		>
			<SelectPrimitiveTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="warehouseFull"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					removeTestID="filter-pill-remove-stock_status"
					onRemove={() => actions.clearFilter('stock_status')}
				>
					<ButtonText decodeHtml>{value?.label || t('common.stock_status')}</ButtonText>
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
