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

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 * Helper function - @TODO move to utils
 */
const upsertMetaData = (metaDataArray, key, value) => {
	const index = metaDataArray.findIndex((item) => item.key === key);
	if (index !== -1) {
		metaDataArray[index].value = value;
	} else {
		metaDataArray.push({ key, value });
	}
};

/**
 *
 */
export const Actions = ({ row }: CellContext<{ document: OrderDocument }, 'actions'>) => {
	const order = row.original.document;
	const router = useRouter();
	// const status = useObservableState(order.status$, order.status);
	const pullDocument = usePullDocument();
	const { localPatch } = useLocalMutation();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { store, wpCredentials } = useAppState();
	const orderHasID = useObservableEagerState(order.id$); // we need to update the menu with change to order.id
	const deleteDocument = useDeleteDocument();

	/**
	 * To re-open an order, we need to:
	 * - change the status to 'pos-open'
	 * - update _pos_user meta to current user
	 * - update _pos_store meta to current store
	 * - navigate to POS screen
	 */
	const handleOpen = React.useCallback(async () => {
		const meta_data = order.getLatest().toMutableJSON()?.meta_data || [];
		upsertMetaData(meta_data, '_pos_user', String(wpCredentials.id));
		if (store.id !== 0) {
			upsertMetaData(meta_data, '_pos_store', String(store.id));
		}

		await localPatch({ document: order, data: { status: 'pos-open', meta_data } });
		router.push({
			pathname: '/cart' + (order.uuid ? `/${order.uuid}` : ''),
		});
	}, [localPatch, router, order, store.id, wpCredentials.id]);

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		try {
			const latest = order.getLatest();

			if (latest.id) {
				await deleteDocument(latest.id, latest.collection);
			}
			await latest.remove();
		} finally {
			//
		}
	}, [deleteDocument, order]);

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
								pathname: `/orders/edit/${order.uuid}`,
							})
						}
					>
						<Icon name="penToSquare" />
						<Text>{t('Edit')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem onPress={handleOpen}>
						<Icon name="cartShopping" />
						<Text>{t('Re-open')}</Text>
					</DropdownMenuItem>
					{orderHasID && (
						<>
							<DropdownMenuItem
								onPress={() => router.push({ pathname: `/orders/receipt/${order.uuid}` })}
							>
								<Icon name="receipt" />
								<Text>{t('Receipt')}</Text>
							</DropdownMenuItem>
							<DropdownMenuItem onPress={() => pullDocument(order.id, order.collection)}>
								<Icon name="arrowRotateRight" />
								<Text>{t('Sync')}</Text>
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onPress={() => setDeleteDialogOpened(true)}>
						<Icon
							name="trash"
							className="fill-destructive web:group-focus:fill-accent-foreground"
						/>
						<Text>{t('Delete')}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{order.id
								? t('Delete order {id}', {
										id: order.id,
									})
								: t('Delete order')}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{order.id
								? t(
										'Are you sure you want to delete this order? Deleted orders will be placed in the Trash on the server.'
									)
								: t(
										'Are you sure you want to delete this order? This order has not been saved to the server, it will be deleted permanently.'
									)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleDelete}>
							{t('Delete')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
