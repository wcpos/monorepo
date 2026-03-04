import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function Usage({ row }: CellContext<{ document: CouponDocument }, 'usage_count'>) {
	const coupon = row.original.document;
	const usageCount = useObservableEagerState(coupon.usage_count$);
	const usageLimit = useObservableEagerState(coupon.usage_limit$);

	const display = usageLimit ? `${usageCount} / ${usageLimit}` : String(usageCount);

	return <Text className="text-center">{display}</Text>;
}
