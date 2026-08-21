import { useLocalSearchParams } from 'expo-router';

import { Suspense } from '@wcpos/components/suspense';

import { EditCoupon } from './edit-coupon';
import { useEngineRecord } from '../../hooks/use-engine-document';

export function EditCouponScreen() {
	const { couponId } = useLocalSearchParams<{ couponId: string }>();
	const resource = useEngineRecord('coupons', couponId);

	return (
		<Suspense>
			<EditCoupon resource={resource} />
		</Suspense>
	);
}
