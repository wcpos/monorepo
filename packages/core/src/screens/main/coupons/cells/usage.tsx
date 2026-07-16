import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

import { NO_USAGE_LIMIT } from '../../components/coupon/usage-limit';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function Usage({ row }: CellContext<{ document: CouponDocument }, 'usage_count'>) {
	const coupon = row.original.document;
	const usageCount = useObservableEagerState(coupon.usage_count$!) ?? 0;
	const usageLimit = useObservableEagerState(coupon.usage_limit$!);

	// A limit of 0 means "no limit" (same as null) — WooCommerce stores a cleared limit as 0
	// and coupon-validation.ts treats `usage_limit > 0` as the only real limit. Only render
	// "count / limit" for a positive limit; this also covers the offline/optimistic window
	// before the server echoes the cleared value back as null.
	const hasLimit = usageLimit != null && usageLimit > NO_USAGE_LIMIT;
	const display = hasLimit ? `${usageCount} / ${usageLimit}` : String(usageCount ?? 0);

	return <Text className="text-center">{display}</Text>;
}
