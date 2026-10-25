import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { useDialog } from '@wcpos/components/dialog';
import { SavedFieldProvider } from '@wcpos/components/form';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { useRecordAutosave } from '../../components/use-record-autosave';
import { CouponForm, couponFormSchema } from '../../components/coupon/coupon-form';
import { useCouponRecord } from '../commands/use-coupon-record';
import { DeleteCouponDialog, useCouponActions } from '../coupon-actions';

interface Props {
	coupon: EngineRecord<'coupons'>;
}

export function EditCouponForm(props: Props) {
	return (
		<SavedFieldProvider>
			<EditCouponFormFields {...props} />
		</SavedFieldProvider>
	);
}

function EditCouponFormFields({ coupon }: Props) {
	const t = useT();
	const { saveCouponFields } = useCouponRecord();
	const { close } = useDialog();
	// The modal route sits outside the list's ProAccessProvider, so it reads the licence itself.
	const readOnly = !(useAppInfo().license?.isPro ?? false);

	const form = useForm<z.infer<typeof couponFormSchema>>({
		resolver: zodResolver(couponFormSchema as never) as never,
		defaultValues: {
			...coupon.toMutableJSON().payload,
		} as z.infer<typeof couponFormSchema>,
	});
	const { flush } = useRecordAutosave({
		form,
		readOnly,
		stored: () => coupon.getLatest().payload,
		persist: (data) => saveCouponFields(coupon, data),
	});
	// Sync flushes pending edits before taking the store's copy.
	const actions = useCouponActions(coupon, {
		onDeleted: close,
		beforeSync: flush,
		onSynced: () =>
			form.reset({ ...coupon.getLatest().payload } as z.infer<typeof couponFormSchema>),
	});

	return (
		<>
			<CouponForm
				form={form}
				footer={{
					destructive: !readOnly &&
						actions.canDelete && {
							label: t('common.delete'),
							testID: 'coupon-modal-delete',
							onPress: actions.requestDelete,
						},
					record: !readOnly &&
						actions.canSync && {
							label: t('common.sync'),
							testID: 'coupon-modal-sync',
							onPress: actions.sync,
						},
					close: { testID: 'coupon-form-close' },
				}}
			/>
			{!readOnly && actions.canDelete && (
				<DeleteCouponDialog
					record={coupon}
					open={actions.deleteOpen}
					onOpenChange={actions.setDeleteOpen}
					force={actions.force}
					onForceChange={actions.setForce}
					onConfirm={() => void actions.confirmDelete()}
				/>
			)}
		</>
	);
}
