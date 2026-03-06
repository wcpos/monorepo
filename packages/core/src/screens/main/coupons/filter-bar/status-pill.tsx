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
import type { Query } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';

type CouponCollection = import('@wcpos/database').CouponCollection;

interface Props {
	query: Query<CouponCollection>;
}

export function StatusPill({ query }: Props) {
	const selected = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('status') as string | undefined))
	);
	const t = useT();
	const isActive = !!selected;

	const items = React.useMemo(
		() => [
			{ value: 'publish', label: t('common.published') },
			{ value: 'draft', label: t('common.draft') },
			{ value: 'pending', label: t('common.pending') },
			{ value: 'trash', label: t('common.trash') },
		],
		[t]
	);

	const value = React.useMemo(() => {
		const val = items.find((item) => item.value === selected);
		return val ? val : { value: '', label: '' };
	}, [items, selected]);

	return (
		<Select
			value={value}
			onValueChange={(option) => option && query.where('status').equals(option.value).exec()}
		>
			<SelectPrimitiveTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="circleInfo"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => query.removeWhere('status').exec()}
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
