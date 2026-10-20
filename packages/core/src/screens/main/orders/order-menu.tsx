import * as React from 'react';

import { useRouter } from 'expo-router';

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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
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
import { useProAccess } from '../contexts/pro-access';
import { useStorageMoneyPathGuard } from '../hooks/use-storage-health';
import { useReopenOrder } from './use-reopen-order';

const syncLogger = getLogger(['wcpos', 'orders', 'actions', 'sync']);

const REFUNDABLE_STATUSES: readonly string[] = ['completed', 'processing', 'on-hold'];

/**
 *
 */
export function OrderActionsMenu({
	order,
	trigger,
	onDeleted,
}: {
	order: EngineRecord<'orders'>;
	trigger: React.ReactElement;
	onDeleted?: () => void;
}) {
	const record = order;
	const router = useRouter();
	const status = useRecordField(record, ({ payload }) => payload.status);
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const orderID = useRecordField(record, ({ payload }) => payload.id);
	const runtime = useQueryRuntime();
	const { readOnly } = useProAccess();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	const canRefund = orderID && !!status && REFUNDABLE_STATUSES.includes(status);

	const handleRefresh = React.useCallback(() => {
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

	const handleOpen = useReopenOrder(order);

	/**
	 * Handle delete button click
	 */
	/**
	 * Refunds are a money path under the #163 follow-up ruling: cash handed back
	 * with no persistable record is the checkout hazard in reverse. Refuse at the
	 * door rather than letting the cashier into a flow that cannot complete.
	 */
	const handleRefund = React.useCallback(() => {
		if (blockIfDegraded('refund', { orderId: order.uuid })) return;
		router.push({
			pathname: '/orders/refund/[orderId]',
			params: { orderId: order.uuid! },
		});
	}, [blockIfDegraded, order.uuid, router]);

	const handleDelete = React.useCallback(async () => {
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

	if (readOnly) {
		return null;
	}

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onPress={() => router.setParams({ order: order.uuid })}>
						<Icon name="show" />
						<Text>{t('common.view')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem
						onPress={() =>
							router.push({
								pathname: '/orders/edit/[orderId]',
								params: { orderId: order.uuid! },
							})
						}
					>
						<Icon name="edit" />
						<Text>{t('common.edit')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem
						testID="order-reopen-menu-item"
						onPress={handleOpen}
						disabled={storageDegraded}
					>
						<Icon name="cart" />
						<Text>{t('orders.re-open')}</Text>
					</DropdownMenuItem>
					{orderID && (
						<>
							<DropdownMenuItem
								onPress={() =>
									router.push({
										pathname: '/orders/receipt/[orderId]',
										params: { orderId: order.uuid! },
									})
								}
							>
								<Icon name="receipt" />
								<Text>{t('common.receipt')}</Text>
							</DropdownMenuItem>
							{canRefund && (
								<DropdownMenuItem
									testID="order-refund-menu-item"
									onPress={handleRefund}
									disabled={storageDegraded}
								>
									<Icon name="refund" />
									<Text>{t('orders.refund')}</Text>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem testID="order-refresh-menu-item" onPress={handleRefresh}>
								<Icon name="refresh" />
								<Text>{t('common.sync')}</Text>
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						testID="order-delete-menu-item"
						variant="destructive"
						onPress={() => setDeleteDialogOpened(true)}
						disabled={storageDegraded}
					>
						<Icon name="delete" className="text-destructive" />
						<Text>{t('common.delete')}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
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
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction
							testID="order-delete-confirm-button"
							variant="destructive"
							onPress={handleDelete}
							disabled={storageDegraded}
						>
							{t('common.delete')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
