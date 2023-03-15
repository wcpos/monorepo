import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import pick from 'lodash/pick';
import { useObservableState } from 'observable-hooks';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../../lib/translations';
import EditForm from '../../components/edit-form';
import useRestHttpClient from '../../hooks/use-rest-http-client';

interface Props {
	item: import('@wcpos/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const navigation = useNavigation();
	const http = useRestHttpClient();
	const [menuOpened, setMenuOpened] = React.useState(false);
	const [editModalOpened, setEditModalOpened] = React.useState(false);
	const status = useObservableState(order.status$, order.status);

	/**
	 *
	 */
	const handleSync = React.useCallback(async () => {
		// could use the link url?
		// this should be done in replication, can get link and parse data there
		try {
			const { data } = await http.get(`/orders/${order.id}`);
			const parsedData = order.collection.parseRestResponse(data);
			return order.patch(parsedData);
		} catch (err) {
			log.error(err);
		}
	}, [http, order]);

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
			{ label: t('Sync', { _tags: 'core' }), action: handleSync, icon: 'arrowRotateRight' },
			{ label: '__' },
			{
				label: t('Delete', { _tags: 'core' }),
				action: order.remove,
				icon: 'trash',
				type: 'critical',
			},
		];
		if (status === 'completed') {
			menu.splice(1, 0, {
				label: t('Receipt', { _tags: 'core' }),
				icon: 'receipt',
				action: () => navigation.navigate('Receipt', { orderID: order.uuid }),
			});
		}

		return menu;
	}, [handleOpen, handleSync, navigation, order, status]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown
				opened={menuOpened}
				onClose={() => setMenuOpened(false)}
				withinPortal={true}
				placement="bottom-end"
				items={menuItems}
			>
				<Icon name="ellipsisVertical" onPress={() => setMenuOpened(true)} />
			</Dropdown>
		</>
	);
};

export default Actions;
