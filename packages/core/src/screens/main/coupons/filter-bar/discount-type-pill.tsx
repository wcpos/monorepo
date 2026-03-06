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

export function DiscountTypePill({ query }: Props) {
	const selected = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('discount_type') as string | undefined))
	);
	const t = useT();
	const isActive = !!selected;

	const items = React.useMemo(
		() => [
			{ value: 'percent', label: t('coupons.percent') },
			{ value: 'fixed_cart', label: t('coupons.fixed_cart') },
			{ value: 'fixed_product', label: t('coupons.fixed_product') },
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
			onValueChange={(option) => option && query.where('discount_type').equals(option.value).exec()}
		>
			<SelectPrimitiveTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="percent"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => query.removeWhere('discount_type').exec()}
				>
					<ButtonText>{value?.label || t('coupons.discount_type')}</ButtonText>
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
