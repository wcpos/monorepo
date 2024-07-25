import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Query } from '@wcpos/query';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Icon } from '@wcpos/tailwind/src/icon';
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
	const { items, getLabel } = useStockStatusLabel();
	const [open, setOpen] = React.useState(false);

	/**
	 *
	 */
	const label = React.useMemo(() => {
		if (!selected) {
			return t('Stock Status', { _tags: 'core' });
		}

		const label = getLabel(selected);
		if (label) {
			return label;
		}

		return String(selected);
	}, [getLabel, selected, t]);

	return (
		<Select
			onOpenChange={setOpen}
			onValueChange={({ value }) => query.where('stock_status', value)}
		>
			<SelectPrimitive.Trigger asChild>
				<Button onPress={() => setOpen(!open)}>
					<Icon name="warehouseFull" />
					<ButtonText>{label}</ButtonText>
				</Button>
			</SelectPrimitive.Trigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.label} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);

	// return (
	// 	<Dropdown
	// 		items={items}
	// 		opened={open}
	// 		onClose={() => setOpen(false)}
	// 		onSelect={(val) => query.where('stock_status', val)}
	// 		withArrow={false}
	// 		matchWidth
	// 	>
	// 		<Pill
	// 			icon="warehouseFull"
	// 			size="small"
	// 			color={isActive ? 'primary' : 'lightGrey'}
	// 			onPress={() => setOpen(true)}
	// 			removable={isActive}
	// 			onRemove={() => query.where('stock_status', null)}
	// 		>
	// 			{label}
	// 		</Pill>
	// 	</Dropdown>
	// );
};
