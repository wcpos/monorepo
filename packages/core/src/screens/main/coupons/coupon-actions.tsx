import * as React from 'react';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Checkbox } from '@wcpos/components/checkbox';
import { HStack } from '@wcpos/components/hstack';
import { Label } from '@wcpos/components/label';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { refreshCollection } from '@wcpos/query/record-readers';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { requestServerDelete } from '../hooks/mutations/request-server-delete';
import { useUserCapabilities } from '../hooks/use-user-capabilities';

const syncLogger = getLogger(['wcpos', 'coupons', 'actions', 'sync']);

/** The coupon's record actions, for the coupon modal's footer (the row only opens it). */
export function useCouponActions(
	record: EngineRecord<'coupons'>,
	{
		onDeleted,
		onSynced,
		beforeSync,
	}: {
		onDeleted?: () => void;
		onSynced?: () => void;
		/** Land pending autosave before pulling; false stops a pull from resetting over a failed draft. */
		beforeSync?: () => Promise<boolean>;
	} = {}
) {
	const id = useRecordField(record, ({ payload }) => payload.id);
	const t = useT();
	const runtime = useQueryRuntime();
	const { caps } = useUserCapabilities();
	const [deleteOpen, setDeleteOpenState] = React.useState(false);
	const [force, setForce] = React.useState(!id);

	const sync = React.useCallback(() => {
		void (async () => {
			if (beforeSync && !(await beforeSync())) return;
			await refreshCollection(runtime.engine, {
				id: 'coupon-actions:refresh',
				collection: 'coupons',
			})
				// A collection refresh has no single-record answer: a settled one hands the form the
				// store's copy.
				.then(() => onSynced?.())
				.catch((error) => {
					// The engine already wrote the coded row for this require (SYNC321), and the
					// device's copy is untouched: the cashier only needs to know it didn't refresh.
					syncLogger.debug('Failed to refresh coupons', {
						showToast: true,
						toast: { title: t('common.refresh_failed'), type: 'warning' },
						context: {
							error: getErrorMessage(error),
						},
					});
				});
		})();
	}, [runtime, t, beforeSync, onSynced]);

	// Each opening starts from the default: a coupon never pushed is force-deleted.
	const setDeleteOpen = React.useCallback(
		(open: boolean) => {
			setDeleteOpenState(open);
			if (open) setForce(!id);
		},
		[id]
	);

	const confirmDelete = React.useCallback(async () => {
		await requestServerDelete(runtime.engine, {
			collection: 'coupons',
			recordId: record.uuid,
		});
		onDeleted?.();
	}, [record.uuid, runtime, onDeleted]);

	return {
		sync,
		canSync: Boolean(id),
		canDelete: caps.canDeleteCoupons,
		requestDelete: React.useCallback(() => setDeleteOpen(true), [setDeleteOpen]),
		confirmDelete,
		deleteOpen,
		setDeleteOpen,
		force,
		setForce,
	};
}

/** The force-delete confirm the modal's Delete passes through. */
export function DeleteCouponDialog({
	record,
	open,
	onOpenChange,
	force,
	onForceChange,
	onConfirm,
}: {
	record: EngineRecord<'coupons'>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	force: boolean;
	onForceChange: (force: boolean) => void;
	onConfirm: () => void;
}) {
	const t = useT();
	const code = useRecordField(record, ({ payload }) => payload.code);
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('coupons.delete', { name: code })}</AlertDialogTitle>
					<AlertDialogDescription>
						<VStack>
							<Text className="text-destructive">{t('coupons.are_you_sure_you_want_to')}</Text>
							<HStack>
								<Checkbox
									aria-labelledby="confirm"
									onCheckedChange={onForceChange}
									checked={force}
								/>
								<Label
									nativeID="confirm"
									onPress={() => {
										onForceChange(!force);
									}}
								>
									{t('coupons.confirm')}
								</Label>
							</HStack>
						</VStack>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter
					cancel={true}
					confirm={{
						label: t('common.delete'),
						testID: 'coupon-delete-confirm-button',
						destructive: true,
						disabled: !force,
						onPress: onConfirm,
					}}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
