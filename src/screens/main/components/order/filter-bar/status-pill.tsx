import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import { Select, SelectContent, SelectItem, SelectPrimitive } from '@wcpos/components/src/select';
import type { OrderCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useOrderStatusLabel } from '../../../hooks/use-order-status-label';

interface Props {
	query: Query<OrderCollection>;
}

/**
 *
 */
export const StatusPill = ({ query }: Props) => {
	const selected = useObservableEagerState(
		query.params$.pipe(map(() => query.findSelector('status')))
	);
	const t = useT();
	const isActive = !!selected;
	const [open, setOpen] = React.useState(false);
	const { items } = useOrderStatusLabel();
	const value = items.find((item) => item.value === selected);

	/**
	 *
	 */
	return (
		<Select
			value={value}
			onOpenChange={setOpen}
			onValueChange={({ value }) => query.where('status', value)}
		>
			<SelectPrimitive.Trigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="cartCircleCheck"
					variant={isActive ? 'default' : 'muted'}
					onPress={() => setOpen(!open)}
					removable={isActive}
					onRemove={() => query.where('status', null)}
				>
					<ButtonText>{value?.label || t('Status', { _tags: 'core' })}</ButtonText>
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
