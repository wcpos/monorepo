import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';

import { useT } from '../../../../contexts/translations';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

const labelMap: Record<string, string> = {
	publish: 'coupons.publish',
	draft: 'coupons.draft',
	pending: 'coupons.pending',
};

export function Status({ row, table }: CellContext<{ document: CouponDocument }, 'status'>) {
	const coupon = row.original.document;
	const status = useObservableEagerState(coupon.status$!) as string;
	const t = useT();
	const query = (table.options.meta as unknown as { query: any })?.query;

	const label = labelMap[status] ? t(labelMap[status]) : status;

	return (
		<ButtonPill
			variant="ghost-primary"
			size="xs"
			onPress={() => query?.where('status').equals(status).exec()}
		>
			<ButtonText numberOfLines={1}>{label}</ButtonText>
		</ButtonPill>
	);
}
