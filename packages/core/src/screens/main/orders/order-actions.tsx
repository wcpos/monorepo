import * as React from 'react';

import { useRouter } from 'expo-router';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import {
	awaitWriteOutcome,
	type EngineRecord,
	useQueryRuntime,
	useRecordField,
	WriteOutcomeError,
} from '@wcpos/query';
import { refreshRecordByWooId } from '@wcpos/query/record-readers';
import { WOO_REST_CANNOT_DELETE } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { requestServerDelete } from '../hooks/mutations/request-server-delete';
import { useStorageMoneyPathGuard } from '../hooks/use-storage-health';
import { useReopenOrder } from './use-reopen-order';

const syncLogger = getLogger(['wcpos', 'orders', 'actions', 'sync']);

const REFUNDABLE_STATUSES: readonly string[] = ['completed', 'processing', 'on-hold'];

/** The order's actions, shared by the row's ⋮ menu and the order modal's footer. */
export function useOrderActions(
	order: EngineRecord<'orders'>,
	{ onDeleted }: { onDeleted?: () => void } = {}
) {
	const router = useRouter();
	const status = useRecordField(order, ({ payload }) => payload.status);
	const [deleteOpen, setDeleteOpen] = React.useState(false);
	const t = useT();
	const orderID = useRecordField(order, ({ payload }) => payload.id);
	const runtime = useQueryRuntime();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	const canRefund = !!orderID && !!status && REFUNDABLE_STATUSES.includes(status);

	const sync = React.useCallback(() => {
		if (!orderID) return;
		void refreshRecordByWooId(runtime.engine, {
			id: `order-actions:refresh:${orderID}`,
			collection: 'orders',
			wooId: orderID,
		}).catch((error) => {
			// The engine already wrote the coded row for this require (SYNC321), and
			// the device's copy is untouched: the cashier only needs to know the
			// refresh did not happen.
			syncLogger.debug('Failed to refresh order', {
				showToast: true,
				toast: { title: t('orders.refresh_failed'), type: 'warning' },
				context: {
					orderId: orderID,
					error: getErrorMessage(error),
				},
			});
		});
	}, [runtime, orderID, t]);

	const { reopen, reopening } = useReopenOrder(order);

	/**
	 * Refunds are a money path under the #163 follow-up ruling: cash handed back
	 * with no persistable record is the checkout hazard in reverse. Refuse at the
	 * door rather than letting the cashier into a flow that cannot complete.
	 */
	const refund = React.useCallback(() => {
		if (blockIfDegraded('refund', { orderId: order.uuid })) return;
		router.push({
			pathname: '/orders/refund/[orderId]',
			params: { orderId: order.uuid! },
		});
	}, [blockIfDegraded, order.uuid, router]);

	const confirmDelete = React.useCallback(async () => {
		// #163 ruling R5: same hazard as the cart's Void — a delete the device
		// cannot record leaves the order's fate unknowable locally.
		if (blockIfDegraded('void', { orderId: order.uuid })) return;

		const receipt = await requestServerDelete(runtime.engine, {
			collection: 'orders',
			recordId: order.uuid!,
		});
		if (!receipt.annihilated) {
			void awaitWriteOutcome(runtime.engine, receipt.mutationId).catch((error) => {
				if (error instanceof WriteOutcomeError && error.reason === WOO_REST_CANNOT_DELETE) {
					// The engine's push.rejected row (SYNC201) already records this refusal;
					// the cashier is owed the toast, not a second row.
					syncLogger.debug('Server refused to delete order', {
						showToast: true,
						// For AUTH201's hint: nothing was lost, ask the admin for the permission.
						code: ERROR_CODES.INSUFFICIENT_ROLE,
						toast: { title: t('orders.delete_not_permitted'), type: 'error' },
						context: { orderId: order.uuid },
					});
				}
			});
		}
		onDeleted?.();
	}, [blockIfDegraded, runtime, order.uuid, t, onDeleted]);

	return {
		orderID,
		canRefund,
		storageDegraded,
		reopen,
		reopening,
		sync,
		refund,
		requestDelete: React.useCallback(() => setDeleteOpen(true), []),
		confirmDelete,
		deleteOpen,
		setDeleteOpen,
	};
}

/** The confirm a delete passes through, from the ⋮ menu or the modal's footer. */
export function DeleteOrderDialog({
	orderID,
	open,
	onOpenChange,
	onConfirm,
	disabled,
}: {
	orderID?: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	disabled: boolean;
}) {
	const t = useT();
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{orderID
							? t('orders.delete_order_2', {
									id: orderID,
								})
							: t('orders.delete_order')}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{orderID
							? t('orders.are_you_sure_you_want_to')
							: t('orders.are_you_sure_you_want_to_2')}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter
					confirm={{
						destructive: true,
						label: t('common.delete'),
						testID: 'order-delete-confirm-button',
						onPress: onConfirm,
						disabled,
					}}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
