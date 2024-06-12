import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableEagerState, useObservableState } from 'observable-hooks';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import DeleteDialog from './delete-dialog';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

interface Props {
	item: import('@wcpos/database').OrderDocument;
}

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
const Actions = ({ item: order }: Props) => {
	const navigation = useNavigation();
	const [menuOpened, setMenuOpened] = React.useState(false);
	// const status = useObservableState(order.status$, order.status);
	const pullDocument = usePullDocument();
	const { localPatch } = useLocalMutation();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { store, wpCredentials } = useAppState();
	const orderHasID = useObservableEagerState(order.id$); // we need to update the menu with change to order.id

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
	 *
	 */
	const menuItems = React.useMemo(() => {
		const menu = [
			{
				label: t('Edit', { _tags: 'core' }),
				action: () => navigation.navigate('EditOrder', { orderID: order.uuid }),
				icon: 'penToSquare',
			},
			{
				label: t('Re-open', { _tags: 'core', _context: 'Re-open completed order' }),
				action: handleOpen,
				icon: 'cartShopping',
			},
			{ label: '__' },
			{
				label: t('Delete', { _tags: 'core' }),
				action: () => setDeleteDialogOpened(true),
				icon: 'trash',
				type: 'critical',
			},
		];

		// if order has an id, then it can be synced
		if (orderHasID) {
			menu.splice(2, 0, {
				label: t('Sync', { _tags: 'core' }),
				action: () => {
					if (order.id) {
						pullDocument(order.id, order.collection);
					}
				},
				icon: 'arrowRotateRight',
			});
		}

		// if order has an id, then it has a receipt
		if (orderHasID) {
			menu.splice(1, 0, {
				label: t('Receipt', { _tags: 'core' }),
				icon: 'receipt',
				action: () => navigation.navigate('Receipt', { orderID: order.uuid }),
			});
		}

		return menu;
	}, [handleOpen, navigation, order.collection, order.id, order.uuid, orderHasID, pullDocument, t]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown
				opened={menuOpened}
				onClose={() => setMenuOpened(false)}
				placement="bottom-end"
				items={menuItems}
				withinPortal
			>
				<Icon name="ellipsisVertical" onPress={() => setMenuOpened(true)} />
			</Dropdown>

			<Modal opened={deleteDialogOpened} onClose={() => setDeleteDialogOpened(false)}>
				<DeleteDialog order={order} setDeleteDialogOpened={setDeleteDialogOpened} />
			</Modal>
		</>
	);
};

export default Actions;
