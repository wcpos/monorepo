import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableEagerState } from 'observable-hooks';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogCancel,
	AlertDialogAction,
	AlertDialogFooter,
	AlertDialogDescription,
} from '@wcpos/components/src/alert-dialog';
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '@wcpos/components/src/dropdown-menu';
import { Icon } from '@wcpos/components/src/icon';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';

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
	const navigation = useNavigation();
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
		navigation.navigate('POSStack', { screen: 'POS', params: { orderID: order.uuid } });
	}, [localPatch, navigation, order, store.id, wpCredentials.id]);

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
						onPress={() => navigation.navigate('EditOrder', { orderID: order.uuid })}
					>
						<Icon name="penToSquare" />
						<Text>{t('Edit', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem onPress={handleOpen}>
						<Icon name="cartShopping" />
						<Text>{t('Re-open', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
					{orderHasID && (
						<>
							<DropdownMenuItem
								onPress={() => navigation.navigate('Receipt', { orderID: order.uuid })}
							>
								<Icon name="receipt" />
								<Text>{t('Receipt', { _tags: 'core' })}</Text>
							</DropdownMenuItem>
							<DropdownMenuItem onPress={() => pullDocument(order.id, order.collection)}>
								<Icon name="arrowRotateRight" />
								<Text>{t('Sync', { _tags: 'core' })}</Text>
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onPress={() => setDeleteDialogOpened(true)}>
						<Icon
							name="trash"
							className="fill-destructive web:group-focus:fill-accent-foreground"
						/>
						<Text>{t('Delete', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{order.id
								? t('Delete order {id}', {
										_tags: 'core',
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
										'Are you sure you want to delete this order? This order has not been saved to the server, it will be deleted permanently.',
										{ _tags: 'core' }
									)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel', { _tags: 'core' })}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleDelete}>
							{t('Delete', { _tags: 'core' })}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
