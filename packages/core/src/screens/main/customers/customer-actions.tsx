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
import { type ReadonlyEngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { refreshRecordByWooId } from '@wcpos/query/record-readers';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format';
import { requestServerDelete } from '../hooks/mutations/request-server-delete';
import { useUserCapabilities } from '../hooks/use-user-capabilities';

const syncLogger = getLogger(['wcpos', 'customers', 'actions', 'sync']);

/** The customer's record actions, for the customer modal's footer (the row only opens it). */
export function useCustomerActions(
	record: ReadonlyEngineRecord<'customers'>,
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
	const [deleteOpen, setDeleteOpen] = React.useState(false);
	const [force, setForce] = React.useState(!id);

	const sync = React.useCallback(() => {
		if (!id) return;
		void (async () => {
			if (beforeSync && !(await beforeSync())) return;
			await refreshRecordByWooId(runtime.engine, {
				id: `customer-actions:refresh:${id}`,
				collection: 'customers',
				wooId: id,
			})
				// Only the engine's applied answer hands the form the store's copy: a pull can settle
				// with the row kept back for its pending local work.
				.then((applied) => {
					if (applied) onSynced?.();
				})
				.catch((error) => {
					// The engine already wrote the coded row for this require (SYNC321), and the
					// device's copy is untouched: the cashier only needs to know it didn't refresh.
					syncLogger.debug('Failed to refresh customer', {
						showToast: true,
						toast: { title: t('common.refresh_failed'), type: 'warning' },
						context: {
							customerId: id,
							error: getErrorMessage(error),
						},
					});
				});
		})();
	}, [id, runtime, t, beforeSync, onSynced]);

	const confirmDelete = React.useCallback(async () => {
		await requestServerDelete(runtime.engine, {
			collection: 'customers',
			recordId: record.uuid,
		});
		onDeleted?.();
	}, [record.uuid, runtime, onDeleted]);

	return {
		sync,
		canSync: Boolean(id),
		canDelete: caps.canDeleteCustomers,
		// Each opening starts from the default: a customer never pushed is force-deleted.
		requestDelete: React.useCallback(() => {
			setForce(!id);
			setDeleteOpen(true);
		}, [id]),
		confirmDelete,
		deleteOpen,
		setDeleteOpen,
		force,
		setForce,
	};
}

/** The force-delete confirm the modal's Delete passes through. */
export function DeleteCustomerDialog({
	record,
	open,
	onOpenChange,
	force,
	onForceChange,
	onConfirm,
}: {
	record: ReadonlyEngineRecord<'customers'>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	force: boolean;
	onForceChange: (force: boolean) => void;
	onConfirm: () => void;
}) {
	const t = useT();
	const customer = useRecordField(record, ({ payload }) => payload);
	const { format } = useCustomerNameFormat();
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t('customers.delete', {
							name: format(customer),
						})}
					</AlertDialogTitle>
					<AlertDialogDescription>
						<VStack>
							<Text className="text-destructive">{t('customers.are_you_sure_you_want_to')}</Text>
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
									{t('customers.confirm')}
								</Label>
							</HStack>
						</VStack>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter
					cancel={true}
					confirm={{
						label: t('common.delete'),
						testID: 'customer-delete-confirm-button',
						destructive: true,
						disabled: !force,
						onPress: onConfirm,
					}}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
