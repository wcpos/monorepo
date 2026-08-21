import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { useModal } from '@wcpos/components/modal';
import type { EngineRecord } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { CouponForm, couponFormSchema } from '../../components/coupon/coupon-form';
import { usePushDocument } from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const mutationLogger = getLogger(['wcpos', 'mutations', 'coupon']);

interface Props {
	coupon: EngineRecord<'coupons'>;
}

export function EditCouponForm({ coupon }: Props) {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	const { close } = useModal();

	const form = useForm<z.infer<typeof couponFormSchema>>({
		resolver: zodResolver(couponFormSchema as never) as never,
		defaultValues: {
			...coupon.toMutableJSON().payload,
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
				const savedDoc = await pushDocument(coupon);
				if (!savedDoc) {
					throw new Error('Failed to save coupon');
				}
				const saved = coupon.getLatest().payload;
				mutationLogger.success(t('common.saved', { name: saved.code }), {
					showToast: true,
					context: {
						couponId: saved.id,
						couponCode: saved.code,
					},
				});
				close();
			} catch (error) {
				const errorMessage = getErrorMessage(error);
				mutationLogger.error('Failed to save coupon', {
					showToast: true,
					code: ERROR_CODES.SYNC_UNEXPECTED,
					toast: { title: t('coupons.failed_to_save_coupon') },
					context: {
						couponId: coupon.getLatest().payload.id,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[close, localPatch, coupon, pushDocument, t]
	);

	return <CouponForm form={form} onClose={close} onSubmit={handleSave} loading={loading} />;
}
