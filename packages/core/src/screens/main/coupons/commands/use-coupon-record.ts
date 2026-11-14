import * as React from 'react';

import type { CouponPayload, EngineRecord, ReadonlyEngineRecord } from '@wcpos/query';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useMutation } from '../../hooks/mutations/use-mutation';

export function useCouponRecord({
	showSuccessToast = true,
	awaitRemoteId = false,
}: { showSuccessToast?: boolean; awaitRemoteId?: boolean } = {}) {
	const { create, patchRecord } = useMutation({ collectionName: 'coupons', showSuccessToast });
	const { localPatch } = useLocalMutation();
	const createCoupon = React.useCallback(
		(data: Record<string, unknown>): Promise<EngineRecord<'coupons'> | undefined> =>
			// The mutation already toasted the failure, including a repeated scope change.
			create({ data, awaitRemoteId }).catch(() => undefined) as Promise<
				EngineRecord<'coupons'> | undefined
			>,
		[create, awaitRemoteId]
	);
	const saveCouponFields = React.useCallback(
		async (
			coupon: ReadonlyEngineRecord<'coupons'>,
			data: Partial<CouponPayload>
		): Promise<boolean> => !!(await localPatch({ document: coupon, data }))?.document,
		[localPatch]
	);
	const saveCouponChange = React.useCallback(
		(coupon: ReadonlyEngineRecord<'coupons'>, changes: Record<string, unknown>) =>
			patchRecord({ document: coupon, data: changes }),
		[patchRecord]
	);
	return { createCoupon, saveCouponFields, saveCouponChange };
}
