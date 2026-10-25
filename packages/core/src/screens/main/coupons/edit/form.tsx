import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { useDialog } from '@wcpos/components/dialog';
import { SavedFieldProvider, useFormChangeHandler, useMarkSaved } from '@wcpos/components/form';
import type { CouponPayload, EngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { metaForWrite } from '../../components/meta-for-write';
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
	const markSaved = useMarkSaved();
	const writtenMetaKeys = React.useRef(new Set<string>());
	const { flush } = useFormChangeHandler({
		form,
		onChange: async (changes) => {
			if (readOnly) return false;
			const root = Object.keys(changes)[0].split('.')[0] as keyof z.infer<typeof couponFormSchema>;
			const value = form.getValues(root);
			const wire =
				root === 'meta_data' && Array.isArray(value)
					? metaForWrite(
							form.getValues('meta_data') ?? [],
							coupon.getLatest().payload.meta_data ?? [],
							writtenMetaKeys.current
						)
					: value;
			const written = await saveCouponFields(coupon, { [root]: wire } as Partial<CouponPayload>);
			if (written) markSaved([root]);
			return written;
		},
	});
	// Sync flushes pending edits before taking the store's copy.
	const actions = useCouponActions(coupon, {
		onDeleted: close,
		beforeSync: flush,
		onSynced: () =>
			form.reset({ ...coupon.getLatest().payload } as z.infer<typeof couponFormSchema>),
	});

	// The record's actions sit left of Close: destructive first (orders #2904).
	const footerLeading =
		!readOnly && (actions.canDelete || actions.canSync) ? (
			<>
				{actions.canDelete && (
					<Button
						variant="outline-destructive"
						testID="coupon-modal-delete"
						onPress={actions.requestDelete}
					>
						{t('common.delete')}
					</Button>
				)}
				{actions.canSync && (
					<Button variant="outline" testID="coupon-modal-sync" onPress={actions.sync}>
						{t('common.sync')}
					</Button>
				)}
			</>
		) : undefined;

	return (
		<>
			<CouponForm
				form={form}
				footer={
					<Button testID="coupon-form-close" variant="outline" onPress={close}>
						<ButtonText>{t('common.close')}</ButtonText>
					</Button>
				}
				footerLeading={footerLeading}
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
