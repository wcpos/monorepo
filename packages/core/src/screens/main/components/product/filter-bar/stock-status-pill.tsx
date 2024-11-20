import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/src/select';
import { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useStockStatusLabel } from '../../../hooks/use-stock-status-label';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
export const StockStatusPill = ({ query }: Props) => {
	const selected = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('stock_status')))
	);
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
			onValueChange={({ value }) => query.where('stock_status').equals(value).exec()}
		>
			<SelectPrimitiveTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="warehouseFull"
					variant={isActive ? 'default' : 'muted'}
					removable={isActive}
					onRemove={() => query.removeWhere('stock_status').exec()}
				>
					<ButtonText>{value?.label || t('Stock Status', { _tags: 'core' })}</ButtonText>
				</ButtonPill>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.label} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);
};
