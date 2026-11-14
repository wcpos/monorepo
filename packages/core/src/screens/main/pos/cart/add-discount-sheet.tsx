import * as React from 'react';
import { View } from 'react-native';

import { DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { SegmentedControl } from '@wcpos/components/segmented-control';

import { AddCoupon } from './add-coupon';
import { AddDiscount } from './add-discount';
import { useT } from '../../../../contexts/translations';

export function AddDiscountSheet({ onNewCoupon }: { onNewCoupon: () => void }) {
	const t = useT();
	const [kind, setKind] = React.useState<'quick' | 'coupon'>('quick');

	return (
		<>
			<DialogHeader>
				<DialogTitle>{t('pos_cart.add_discount')}</DialogTitle>
			</DialogHeader>
			<View className="px-4">
				<SegmentedControl
					testID="add-discount-kind"
					value={kind}
					onValueChange={(value) => setKind(value as 'quick' | 'coupon')}
					segments={[
						{
							value: 'quick',
							label: t('pos_cart.quick_discount'),
							testID: 'add-discount-kind-quick',
						},
						{ value: 'coupon', label: t('common.coupon'), testID: 'add-discount-kind-coupon' },
					]}
				/>
			</View>
			<ErrorBoundary>
				{kind === 'quick' ? <AddDiscount /> : <AddCoupon onNewCoupon={onNewCoupon} />}
			</ErrorBoundary>
		</>
	);
}
