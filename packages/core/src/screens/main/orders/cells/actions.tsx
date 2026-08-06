import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';

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
import { awaitWriteOutcome, useQueryRuntime, WriteOutcomeError } from '@wcpos/query';
import { WOO_REST_CANNOT_DELETE } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useProAccess } from '../../contexts/pro-access';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useStorageMoneyPathGuard } from '../../hooks/use-storage-health';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

const syncLogger = getLogger(['wcpos', 'orders', 'actions', 'sync']);

/**
 * Helper function - @TODO move to utils
 */
const upsertMetaData = (
	metaDataArray: { key?: string; value?: unknown; id?: number }[],
	key: string,
	value: string
) => {
	const index = metaDataArray.findIndex((item) => item.key === key);
	if (index !== -1) {
		metaDataArray[index].value = value;
	} else {
		metaDataArray.push({ key, value });
	}
};

const REFUNDABLE_STATUSES: readonly string[] = ['completed', 'processing', 'on-hold'];

/**
 *
 */
export function Actions({ row }: CellContext<{ document: OrderDocument }, 'actions'>) {
	const order = row.original.document;
	const router = useRouter();
	const status = useObservableEagerState(order.status$!);
	const { localPatch } = useLocalMutation();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { store, wpCredentials } = useAppState();
	const orderHasID = useObservableEagerState(order.id$!); // we need to update the menu with change to order.id
	const runtime = useQueryRuntime();
	const { readOnly } = useProAccess();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	const canRefund = orderHasID && !!status && REFUNDABLE_STATUSES.includes(status);

	const handleRefresh = React.useCallback(() => {
		if (!orderHasID) return;
		const handle = runtime.engine.require({
			id: `order-actions:refresh:${orderHasID}`,
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [orderHasID],
			forceRefresh: true,
		});
		void handle.ready
			.finally(() => handle.release())
			.catch((error) => {
				syncLogger.error('Failed to refresh order', {
					showToast: true,
					saveToDb: true,
					context: {
						orderId: orderHasID,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
	}, [runtime, orderHasID]);

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

		const meta_data = order.getLatest().toMutableJSON()?.meta_data || [];
		upsertMetaData(meta_data, '_pos_user', String(wpCredentials.id));
		if (store.id !== 0) {
			upsertMetaData(meta_data, '_pos_store', String(store.id));
		}

		await localPatch({ document: order, data: { status: 'pos-open', meta_data } });
		router.push({
			pathname: '/cart/[...orderId]',
			params: { orderId: order.uuid ? [order.uuid] : [] },
		} as any);
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
		router.push({ pathname: `/orders/refund/${order.uuid}` });
	}, [blockIfDegraded, order.uuid, router]);

	const handleDelete = React.useCallback(async () => {
		// #163 ruling R5: same hazard as the cart's Void — a delete the device
		// cannot record leaves the order's fate unknowable locally.
		if (blockIfDegraded('void', { orderId: order.uuid })) return;

		const receipt = await runtime.engine.write({
			collection: 'orders',
			operation: 'delete',
			recordId: order.uuid!,
		});
		if (!receipt.annihilated) {
			void awaitWriteOutcome(runtime.engine, receipt.mutationId).catch((error) => {
				if (error instanceof WriteOutcomeError && error.reason === WOO_REST_CANNOT_DELETE) {
					syncLogger.error(t('orders.delete_not_permitted'), {
						showToast: true,
						saveToDb: true,
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
					<IconButton name="ellipsisVertical" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onPress={() =>
							router.push({
								pathname: `/orders/view/${order.uuid}`,
							})
						}
					>
						<Icon name="eye" />
						<Text>{t('common.view')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem
						onPress={() =>
							router.push({
								pathname: `/orders/edit/${order.uuid}`,
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
					{orderHasID && (
						<>
							<DropdownMenuItem
								onPress={() => router.push({ pathname: `/orders/receipt/${order.uuid}` })}
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
							{order.id
								? t('orders.delete_order_2', {
										id: order.id,
									})
								: t('orders.delete_order')}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{order.id
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
