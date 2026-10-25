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
	{ onDeleted, onSynced }: { onDeleted?: () => void; onSynced?: () => void } = {}
) {
	const id = useRecordField(record, ({ payload }) => payload.id);
	const t = useT();
	const runtime = useQueryRuntime();
	const { caps } = useUserCapabilities();
	const [deleteOpen, setDeleteOpen] = React.useState(false);
	const [force, setForce] = React.useState(!id);

	const sync = React.useCallback(() => {
		if (!id) return;
		void refreshRecordByWooId(runtime.engine, {
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
	}, [id, runtime, t, onSynced]);

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
				<AlertDialogFooter>
					<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
					<AlertDialogAction
						testID="customer-delete-confirm-button"
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
