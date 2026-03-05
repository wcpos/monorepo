import { useObservableEagerState } from 'observable-hooks';

import { Icon } from '@wcpos/components/icon';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function Active({ row }: CellContext<{ document: CouponDocument }, string>) {
	const coupon = row.original.document;
	const status = useObservableEagerState(coupon.status$!) as string;
	const dateExpiresGmt = useObservableEagerState(
		(coupon as unknown as Record<string, unknown>).date_expires_gmt$ as import('rxjs').Observable<
			string | null | undefined
		>
	) as string | null;

	const isExpired = dateExpiresGmt ? new Date(dateExpiresGmt) < new Date() : false;
	const isActive = status === 'publish' && !isExpired;

	if (!isActive) return null;

	return <Icon name="circleCheck" className="text-success" />;
}
