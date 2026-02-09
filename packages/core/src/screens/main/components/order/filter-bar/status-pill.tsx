import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';
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
	const value = items.find((item) => item.value === (selected as unknown as string));

	/**
	 *
	 */
	return (
		<Select
			value={value}
			onValueChange={(option) => option && query.where('status').equals(option.value).exec()}
		>
			<SelectPrimitiveTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="cartCircleCheck"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => query.removeWhere('status').exec()}
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
};
