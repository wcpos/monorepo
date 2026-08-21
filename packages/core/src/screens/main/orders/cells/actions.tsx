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
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import {
	awaitWriteOutcome,
	type EngineRecord,
	useQueryRuntime,
	useRecordField,
	WriteOutcomeError,
} from '@wcpos/query';
import {
	NO_STORE,
	POS_META_KEYS,
	remoteIdOrNull,
	WOO_REST_CANNOT_DELETE,
	wooMetaCarrier,
} from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { CellContext } from '@wcpos/core/table-types';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { requestServerDelete } from '../../hooks/mutations/request-server-delete';
import { useProAccess } from '../../contexts/pro-access';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useStorageMoneyPathGuard } from '../../hooks/use-storage-health';

const syncLogger = getLogger(['wcpos', 'orders', 'actions', 'sync']);

const REFUNDABLE_STATUSES: readonly string[] = ['completed', 'processing', 'on-hold'];

/**
 *
 */
export function Actions({ row }: CellContext<{ record: EngineRecord<'orders'> }, 'actions'>) {
	const order = row.original.record;
	const record = order;
	const router = useRouter();
	const status = useRecordField(record, ({ payload }) => payload.status);
	const { localPatch } = useLocalMutation();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { store, wpCredentials } = useAppState();
	const orderID = useRecordField(record, ({ payload }) => payload.id);
	const runtime = useQueryRuntime();
	const { readOnly } = useProAccess();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	const canRefund = orderID && !!status && REFUNDABLE_STATUSES.includes(status);

	const handleRefresh = React.useCallback(() => {
		if (!orderID) return;
		const handle = runtime.engine.require({
			id: `order-actions:refresh:${orderID}`,
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: [orderID].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
			forceRefresh: true,
		});
		void handle.ready
			.finally(() => handle.release())
			.catch((error) => {
				syncLogger.error('Failed to refresh order', {
					code: ERROR_CODES.SYNC_UNEXPECTED,
					showToast: true,
					context: {
						orderId: orderID,
						error: getErrorMessage(error),
					},
				});
			});
	}, [runtime, orderID]);

	/**
	 * To re-open an order, we need to:
	 * - change the status to 'pos-open'
	 * - update _pos_user meta to current user
	 * - update _pos_store meta to current store
	 * - navigate to POS screen
	 */
	const handleOpen = React.useCallback(async () => {
		// #163 ruling R5: re-opening writes status + cashier/store meta to the order.
		// With the worker dead that write cannot be recorded, and the cart it lands
		// in could not be checked out anyway.
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;

		const existingMeta = order.payload.meta_data ?? [];
		const existingStoreId = wooMetaCarrier.readIdentity(existingMeta).storeId;
		let meta_data = wooMetaCarrier.stampIdentity(existingMeta, {
			userId: wpCredentials.id,
			storeId: store.id === NO_STORE ? (existingStoreId ?? NO_STORE) : store.id,
		});
		if (store.id === NO_STORE && existingStoreId === null) {
			meta_data = meta_data.filter((entry) => entry.key !== POS_META_KEYS.store);
		}

		await localPatch({
			document: order,
			data: { status: 'pos-open', meta_data },
		});
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
		router.push({
			pathname: '/cart/[...orderId]',
			params: { orderId: order.uuid ? [order.uuid] : [] },
		});
	}, [blockIfDegraded, localPatch, router, order, store.id, wpCredentials.id]);

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
					syncLogger.error('Server refused to delete order', {
						code: ERROR_CODES.SYNC_UNEXPECTED,
						showToast: true,
						toast: { title: t('orders.delete_not_permitted') },
						context: { orderId: order.uuid },
					});
				}
			});
		}
	}, [blockIfDegraded, runtime, order.uuid, t]);

	if (readOnly) {
		return null;
	}

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton testID="order-actions-button" name="ellipsisVertical" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onPress={() =>
							router.push({
								pathname: '/orders/view/[orderId]',
								params: { orderId: order.uuid! },
							})
						}
					>
						<Icon name="eye" />
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
						<Icon name="penToSquare" />
						<Text>{t('common.edit')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem
						testID="order-reopen-menu-item"
						onPress={handleOpen}
						disabled={storageDegraded}
					>
						<Icon name="cartShopping" />
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
									<Icon name="arrowRotateLeft" />
									<Text>{t('orders.refund')}</Text>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onPress={handleRefresh}>
								<Icon name="arrowRotateRight" />
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
						<Icon
							name="trash"
							className="fill-destructive web:group-focus:fill-accent-foreground"
						/>
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
