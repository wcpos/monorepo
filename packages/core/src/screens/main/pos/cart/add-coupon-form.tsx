import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { getErrorMessage, getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { CouponForm, couponFormSchema } from '../../components/coupon/coupon-form';
import { useCouponRecord } from '../../coupons/commands/use-coupon-record';
import { usePanelSide } from '../contexts/overlay-side';
import { useAddCoupon } from '../hooks/use-add-coupon';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'coupon']);

function AddCouponFormBody({ onClose }: { onClose: () => void }) {
	const t = useT();
	// The form says its own sentence below; the funnel's "Coupon saved" would be a second toast.
	// The store acknowledges the coupon before it is applied: the sale carries only the code, and
	// WooCommerce refuses an order whose coupon does not exist yet. An order queued earlier keeps
	// its place in the queue, so a queued create could not be relied on to land first; offline, the
	// New coupon door is closed (add-coupon.tsx).
	const { createCoupon } = useCouponRecord({ showSuccessToast: false, awaitRemoteId: true });
	const { addCoupon } = useAddCoupon();
	const [loading, setLoading] = React.useState(false);
	const form = useForm<z.infer<typeof couponFormSchema>>({
		resolver: zodResolver(couponFormSchema as never) as never,
		defaultValues: { discount_type: 'percent' },
	});
	const handleSave = async (data: z.infer<typeof couponFormSchema>) => {
		setLoading(true);
		try {
			const created = await createCoupon(data);
			if (!created) return;
			const code = (created.payload?.code ?? data.code) as string;
			const result = await addCoupon(code);
			if (result.success) {
				cartLogger.success(t('pos_cart.coupon_created_applied', { code }), {
					showToast: true,
					context: { couponCode: code },
				});
			} else if (result.error) {
				// No sentence means a hook already presented its refusal: not echoed (use-add-coupon).
				cartLogger.warn(t('pos_cart.coupon_created_not_applied', { code }), {
					showToast: true,
					toast: {
						title: t('pos_cart.coupon_created_not_applied', { code }),
						text2: result.error,
					},
					context: { couponCode: code, error: result.error },
				});
			}
			onClose();
		} catch (error) {
			if (isErrorReported(error)) return;
			cartLogger.error('Coupon could not be added to the cart', {
				showToast: true,
				code: ERROR_CODES.CART_UPDATE_FAILED,
				context: { error: getErrorMessage(error) },
			});
		} finally {
			setLoading(false);
		}
	};
	const onSubmit = form.handleSubmit(handleSave);

	return (
		<CouponForm
			form={form}
			footer={{
				intent: {
					label: t('coupons.add_coupon'),
					testID: 'coupon-form-add',
					loading,
					onPress: () => void onSubmit(),
				},
				close: { testID: 'coupon-form-close' },
			}}
		/>
	);
}

export function AddCouponFormDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const side = usePanelSide('cart');
	const t = useT();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} testID="add-new-coupon-dialog" size="xl" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('coupons.add_coupon')}</DialogTitle>
				</DialogHeader>
				<ErrorBoundary>
					<AddCouponFormBody onClose={() => onOpenChange(false)} />
				</ErrorBoundary>
			</DialogContent>
		</Dialog>
	);
}
