import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { CouponForm, couponFormSchema } from '../../components/coupon/coupon-form';
import { usePushDocument } from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const mutationLogger = getLogger(['wcpos', 'mutations', 'coupon']);

interface Props {
	coupon: import('@wcpos/database').CouponDocument;
}

export function EditCouponForm({ coupon }: Props) {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	const router = useRouter();

	const form = useForm<z.infer<typeof couponFormSchema>>({
		resolver: zodResolver(couponFormSchema as never) as never,
		defaultValues: {
			...(coupon.toJSON() as Record<string, unknown>),
		} as z.infer<typeof couponFormSchema>,
	});

	const handleSave = React.useCallback(
		async (data: z.infer<typeof couponFormSchema>) => {
			setLoading(true);
			try {
				const patched = await localPatch({
					document: coupon,
					data: data as Partial<import('@wcpos/database').CouponDocument>,
				});
				if (!patched?.document) {
					throw new Error('Local patch failed');
				}
				const savedDoc = await pushDocument(patched.document);
				if (!isRxDocument(savedDoc)) {
					throw new Error('Failed to save coupon');
				}
				mutationLogger.success(t('common.saved', { name: (savedDoc as { code?: string }).code }), {
					showToast: true,
					saveToDb: true,
					context: {
						couponId: (savedDoc as { id?: number }).id,
						couponCode: (savedDoc as { code?: string }).code,
					},
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				mutationLogger.error(t('coupons.failed_to_save_coupon'), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						couponId: coupon.id,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[localPatch, coupon, pushDocument, t]
	);

	return (
		<CouponForm form={form} onClose={() => router.back()} onSubmit={handleSave} loading={loading} />
	);
}
