import * as React from 'react';

import { decode } from 'html-entities';

import { Chip } from '@wcpos/components/chip';
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
				<Chip
					icon="warehouseFull"
					on={isActive}
					testID="filter-pill-stock_status"
					clearTestID="filter-pill-remove-stock_status"
					onClear={isActive ? () => actions.clearFilter('stock_status') : undefined}
					clearLabel={t('common.remove')}
					label={decode(
						value?.label ||
							items.find((item) => item.value === 'instock')?.label ||
							t('common.stock_status')
					)}
				/>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem
						key={item.value}
						label={item.label}
						value={item.value}
						testID={`stock-status-option-${item.value}`}
					/>
				))}
			</SelectContent>
		</Select>
	);
}
