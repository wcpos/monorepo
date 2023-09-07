import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import DeleteDialog from './delete-dialog';
import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';

interface Props {
	item: import('@wcpos/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const navigation = useNavigation();
	const [menuOpened, setMenuOpened] = React.useState(false);
	// const status = useObservableState(order.status$, order.status);
	const pullDocument = usePullDocument();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();

	/**
	 *
	 */
	const handleOpen = React.useCallback(() => {
		order.patch({ status: 'pos-open' });
		navigation.navigate('POSStack', { screen: 'POS', params: { orderID: order.uuid } });
	}, [navigation, order]);

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
		if (order.id) {
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
		if (order.id) {
			menu.splice(1, 0, {
				label: t('Receipt', { _tags: 'core' }),
				icon: 'receipt',
				action: () => navigation.navigate('Receipt', { orderID: order.uuid }),
			});
		}

		return menu;
	}, [handleOpen, navigation, order.collection, order.id, order.uuid, pullDocument, t]);

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
