import { useLocalSearchParams } from 'expo-router';

import { Suspense } from '@wcpos/components/suspense';
import type { CouponDocument } from '@wcpos/database';

import { EditCoupon } from './edit-coupon';
import { useEngineDocument } from '../../hooks/use-engine-document';

export function EditCouponScreen() {
	const { couponId } = useLocalSearchParams<{ couponId: string }>();
	const resource = useEngineDocument<CouponDocument>('coupons', couponId);

	return (
		<Suspense>
			<EditCoupon resource={resource} />
		</Suspense>
	);
}
