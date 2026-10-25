import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';
import { CouponForm, couponFormSchema } from '../components/coupon/coupon-form';
import { useCouponRecord } from './commands/use-coupon-record';

export function AddCouponScreen() {
	const { createCoupon } = useCouponRecord();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const router = useRouter();

	const form = useForm<z.infer<typeof couponFormSchema>>({
		resolver: zodResolver(couponFormSchema as never) as never,
		defaultValues: {
			discount_type: 'percent',
		},
	});

	const handleSave = React.useCallback(
		async (data: z.infer<typeof couponFormSchema>) => {
			setLoading(true);
			try {
				const created = await createCoupon(data);
				if (created) {
					router.back();
				}
			} finally {
				setLoading(false);
			}
		},
		[createCoupon, router]
	);

	const onSubmit = form.handleSubmit(handleSave);

	return (
		<Dialog route>
			<DialogContent side="right" size="lg">
				<DialogHeader>
					<DialogTitle>
						<Text>{t('coupons.add_coupon')}</Text>
					</DialogTitle>
				</DialogHeader>
				<ErrorBoundary>
					<CouponForm
						form={form}
						footer={
							<>
								<Button testID="coupon-form-close" variant="outline" onPress={() => router.back()}>
									<ButtonText>{t('common.close')}</ButtonText>
								</Button>
								<Button testID="coupon-form-add" loading={loading} onPress={() => void onSubmit()}>
									<ButtonText>{t('coupons.add_coupon')}</ButtonText>
								</Button>
							</>
						}
					/>
				</ErrorBoundary>
			</DialogContent>
		</Dialog>
	);
}
