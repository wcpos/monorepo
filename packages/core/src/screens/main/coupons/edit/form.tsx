import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { useDialog } from '@wcpos/components/dialog';
import type { CouponPayload, EngineRecord } from '@wcpos/query';
import { getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { CouponForm, couponFormSchema } from '../../components/coupon/coupon-form';
import { reportPushFailure } from '../../contexts/push-failure-code';
import { usePushDocument } from '../../contexts/use-push-document';
import { useCouponRecord } from '../commands/use-coupon-record';

const mutationLogger = getLogger(['wcpos', 'mutations', 'coupon']);

interface Props {
	coupon: EngineRecord<'coupons'>;
}

export function EditCouponForm({ coupon }: Props) {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { saveCouponFields } = useCouponRecord();
	const pushDocument = usePushDocument();
	const { close } = useDialog();

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
				const patched = await saveCouponFields(coupon, data as Partial<CouponPayload>);
				// localPatch reports its own failure (row + toast) and resolves undefined;
				// reporting it again put a second row and toast on one failed save.
				if (!patched) return;
				await pushDocument(coupon);
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
				// A localPatch rethrow (the scope moved twice) is already reported.
				if (isErrorReported(error)) return;
				// The coupon push only enqueues (it does not await the store), so what
				// fails here is the local write, not a store refusal: SYNC101, not SYNC999.
				reportPushFailure(mutationLogger, 'Failed to save coupon', error, {
					fallback: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					title: t('coupons.failed_to_save_coupon'),
					context: { couponId: coupon.getLatest().payload.id },
				});
			} finally {
				setLoading(false);
			}
		},
		[close, saveCouponFields, coupon, pushDocument, t]
	);

	return <CouponForm form={form} onClose={close} onSubmit={handleSave} loading={loading} />;
}
