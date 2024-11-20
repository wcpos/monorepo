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
		query.rxQuery$.pipe(map(() => query.getSelector('status')))
	);
	const t = useT();
	const isActive = !!selected;
	const { items } = useOrderStatusLabel();
	const value = items.find((item) => item.value === selected);

	/**
	 *
	 */
	return (
		<Select value={value} onValueChange={({ value }) => query.where('status').equals(value).exec()}>
			<SelectPrimitiveTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="cartCircleCheck"
					variant={isActive ? 'default' : 'muted'}
					removable={isActive}
					onRemove={() => query.removeWhere('status').exec()}
				>
					<ButtonText>{value?.label || t('Status', { _tags: 'core' })}</ButtonText>
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
