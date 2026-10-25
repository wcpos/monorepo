import * as React from 'react';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
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
	{ onDeleted, onSynced }: { onDeleted?: () => void; onSynced?: () => void } = {}
) {
	const id = useRecordField(record, ({ payload }) => payload.id);
	const t = useT();
	const runtime = useQueryRuntime();
	const { caps } = useUserCapabilities();
	const [deleteOpen, setDeleteOpenState] = React.useState(false);
	const [force, setForce] = React.useState(!id);

	const sync = React.useCallback(() => {
		// A pull can resolve without applying the row (the engine keeps a row with pending local
		// work): only a new revision, a new document object, is the store's copy landing.
		const before = record.getLatest();
		void refreshCollection(runtime.engine, {
			id: 'coupon-actions:refresh',
			collection: 'coupons',
		})
			// Only a refresh that landed hands the form the store's copy.
			.then(() => {
				if (record.getLatest() !== before) onSynced?.();
			})
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
	}, [runtime, t, onSynced, record]);

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
				<AlertDialogFooter>
					<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
					<AlertDialogAction
						testID="coupon-delete-confirm-button"
						variant="destructive"
						disabled={!force}
						onPress={onConfirm}
					>
						{t('common.delete')}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
