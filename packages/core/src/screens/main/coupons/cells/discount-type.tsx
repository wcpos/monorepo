import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';

import { useT } from '../../../../contexts/translations';

import type { QueryStateActions } from '../../../../query';
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
	const actions = (
		table.options.meta as {
			actions?: Pick<QueryStateActions<'coupons'>, 'setFilter'>;
		}
	)?.actions;

	const label = labelMap[discountType] ? t(labelMap[discountType]) : discountType;

	return (
		<ButtonPill
			variant="ghost-primary"
			size="xs"
			onPress={() => actions?.setFilter('discount_type', discountType)}
		>
			<ButtonText numberOfLines={1}>{label}</ButtonText>
		</ButtonPill>
	);
}
