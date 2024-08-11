import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import { Select, SelectContent, SelectItem, SelectPrimitive } from '@wcpos/tailwind/src/select';

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
	const selected = useObservableState(
		query.params$.pipe(map(() => query.findSelector('stock_status'))),
		query.findSelector('stock_status')
	) as string | undefined;
	const t = useT();
	const isActive = !!selected;
	const { items } = useStockStatusLabel();
	const value = items.find((item) => item.value === selected);

	/**
	 *
	 */
	return (
		<Select onValueChange={({ value }) => query.where('stock_status', value)}>
			<SelectPrimitive.Trigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="warehouseFull"
					variant={isActive ? 'default' : 'secondary'}
					removable={isActive}
					onRemove={() => query.where('stock_status', null)}
				>
					<ButtonText>{value?.label || t('Stock Status', { _tags: 'core' })}</ButtonText>
				</ButtonPill>
			</SelectPrimitive.Trigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.label} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);
};
