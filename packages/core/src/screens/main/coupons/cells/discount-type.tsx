import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';

import { useT } from '../../../../contexts/translations';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

const labelMap: Record<string, string> = {
	percent: 'coupons.percent_short',
	fixed_cart: 'coupons.fixed_cart_short',
	fixed_product: 'coupons.fixed_product_short',
};

export function DiscountType({
	row,
	table,
}: CellContext<{ document: CouponDocument }, 'discount_type'>) {
	const coupon = row.original.document;
	const discountType = useObservableEagerState(coupon.discount_type$!) ?? 'percent';
	const t = useT();
	const query = table.options.meta?.query;

	const label = labelMap[discountType] ? t(labelMap[discountType]) : discountType;

	return (
		<ButtonPill
			variant="ghost-primary"
			size="xs"
			onPress={() => query?.where('discount_type').equals(discountType).exec()}
		>
			<ButtonText numberOfLines={1}>{label}</ButtonText>
		</ButtonPill>
	);
}
