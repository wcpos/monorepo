import { useLocalSearchParams } from 'expo-router';

import { Suspense } from '@wcpos/components/suspense';
import { useEngineRecord } from '@wcpos/query/record-readers';

import { EditCoupon } from './edit-coupon';

export function EditCouponScreen() {
	const { couponId } = useLocalSearchParams<{ couponId: string }>();
	const resource = useEngineRecord('coupons', couponId);

	return (
		<Suspense>
			<EditCoupon resource={resource} />
		</Suspense>
	);
}
