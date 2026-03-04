import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { CouponForm, couponFormSchema } from '../components/coupon/coupon-form';
import { useMutation } from '../hooks/mutations/use-mutation';

const mutationLogger = getLogger(['wcpos', 'mutations', 'coupon']);

export function AddCouponScreen() {
	const { create } = useMutation({ collectionName: 'coupons' });
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
				const savedDoc = await create({ data });
				if (savedDoc) {
					mutationLogger.success(t('common.saved', { name: (savedDoc as any).code }), {
						showToast: true,
						saveToDb: true,
						context: {
							couponId: (savedDoc as any).id,
							couponCode: (savedDoc as any).code,
						},
					});
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				mutationLogger.error(t('coupons.failed_to_save_coupon'), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[create, t]
	);

	return (
		<Modal>
			<ModalContent size="lg">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('coupons.add_coupon')}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<ErrorBoundary>
						<CouponForm
							form={form}
							onSubmit={handleSave}
							onClose={() => router.back()}
							loading={loading}
						/>
					</ErrorBoundary>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
