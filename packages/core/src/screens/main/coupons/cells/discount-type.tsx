import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

const styleMap: Record<string, string> = {
	percent: 'bg-primary rounded px-2 py-0.5',
	fixed_cart: 'bg-secondary rounded px-2 py-0.5',
	fixed_product: 'bg-muted rounded px-2 py-0.5',
};

const textStyleMap: Record<string, string> = {
	percent: 'text-primary-foreground text-xs',
	fixed_cart: 'text-secondary-foreground text-xs',
	fixed_product: 'text-muted-foreground text-xs',
};

const labelMap: Record<string, string> = {
	percent: 'coupons.percent',
	fixed_cart: 'coupons.fixed_cart',
	fixed_product: 'coupons.fixed_product',
};

export function DiscountType({ row }: CellContext<{ document: CouponDocument }, 'discount_type'>) {
	const coupon = row.original.document;
	const discountType = useObservableEagerState(coupon.discount_type$);
	const t = useT();

	const resolvedType = discountType ?? 'percent';
	const bgStyle = styleMap[resolvedType] ?? styleMap.percent;
	const txtStyle = textStyleMap[resolvedType] ?? textStyleMap.percent;
	const label = t(labelMap[resolvedType] ?? labelMap.percent);

	return (
		<View className={bgStyle}>
			<Text className={txtStyle}>{label}</Text>
		</View>
	);
}
