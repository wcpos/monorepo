import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { Suspense } from '@wcpos/components/suspense';
import type { CouponDocument } from '@wcpos/database';

import { EditCoupon } from './edit-coupon';
import { useCollection } from '../../hooks/use-collection';

export function EditCouponScreen() {
	const { couponId } = useLocalSearchParams<{ couponId: string }>();
	const { collection } = useCollection('coupons');
	const query = collection.findOneFix(couponId);

	const resource = React.useMemo(
		() => new ObservableResource(query.$) as ObservableResource<CouponDocument>,
		[query]
	);

	return (
		<Suspense>
			<EditCoupon resource={resource} />
		</Suspense>
	);
}
