import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';

import Dialog from '@wcpos/components/src/dialog';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';

import { t } from '../../../../lib/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';

interface Props {
	item: import('@wcpos/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const navigation = useNavigation();
	const [menuOpened, setMenuOpened] = React.useState(false);
	const status = useObservableState(order.status$, order.status);
	const pullDocument = usePullDocument();
	const deleteDocument = useDeleteDocument();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);

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
			{
				label: t('Sync', { _tags: 'core' }),
				action: () => {
					if (order.id) {
						pullDocument(order.id, order.collection);
					}
				},
				icon: 'arrowRotateRight',
			},
			{ label: '__' },
			{
				label: t('Delete', { _tags: 'core' }),
				action: () => setDeleteDialogOpened(true),
				icon: 'trash',
				type: 'critical',
			},
		];
		if (status === 'completed' || status === 'pos-partial') {
			menu.splice(1, 0, {
				label: t('Receipt', { _tags: 'core' }),
				icon: 'receipt',
				action: () => navigation.navigate('Receipt', { orderID: order.uuid }),
			});
		}

		return menu;
	}, [handleOpen, navigation, order.collection, order.id, order.uuid, pullDocument, status]);

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

			<Dialog
				opened={deleteDialogOpened}
				onAccept={async () => {
					if (order.id) {
						await deleteDocument(order.id, order.collection);
					}
					await order.remove();
				}}
				onClose={() => setDeleteDialogOpened(false)}
				children={t('You are about to delete order {id}', {
					_tags: 'core',
					id: order.id || order.uuid,
				})}
			/>
		</>
	);
};

export default Actions;
