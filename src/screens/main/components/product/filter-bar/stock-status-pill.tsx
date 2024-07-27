import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitive,
	SelectTrigger,
} from '@wcpos/tailwind/src/select';

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

	/**
	 *
	 */
	return (
		<Select
			onOpenChange={setOpen}
			onValueChange={({ value }) => query.where('stock_status', value)}
		>
			<SelectPrimitive.Trigger asChild>
				<View>
					<ButtonPill
						size="xs"
						leftIcon="warehouseFull"
						variant={isActive ? 'default' : 'secondary'}
						onPress={() => setOpen(!open)}
						removable={isActive}
						onRemove={() => query.where('stock_status', null)}
					>
						<ButtonText>{label}</ButtonText>
					</ButtonPill>
				</View>
			</SelectPrimitive.Trigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.label} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);
};
