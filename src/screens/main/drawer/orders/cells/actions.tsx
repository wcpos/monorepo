import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import pick from 'lodash/pick';
import { useObservableState } from 'observable-hooks';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../../../../../hooks/use-rest-http-client';
import EditForm from '../../../common/edit-form';

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
	const saveOrder = React.useCallback(async () => {
		const data = await order.toRestApiJSON();
		let endpoint = 'orders';
		if (order.id) {
			endpoint += `/${order.id}`;
		}

		const result = await http(endpoint, {
			method: 'post',
			data,
		});

		if (result.status === 201 || result.status === 200) {
			order.atomicPatch(result.data);
		}

		/**
		 * @TODO - close the modal?
		 * @TODO - show a success message?
		 * @TODO - BUG: form refreshes with old data
		 */
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
	const schema = React.useMemo(() => {
		return {
			...order.collection.schema.jsonSchema,
			properties: pick(order.collection.schema.jsonSchema.properties, [
				'id',
				'status',
				'customer_note',
			]),
		};
	}, [order.collection.schema.jsonSchema]);

	/**
	 *
	 */
	const menuItems = React.useMemo(() => {
		const menu = [
			{
				label: 'Edit',
				action: () => navigation.navigate('EditOrder', { orderID: order._id }),
				icon: 'penToSquare',
			},
			{ label: 'Re-open', action: handleOpen, icon: 'cartShopping' },
			{ label: 'Sync', action: handleSync, icon: 'arrowRotateRight' },
			{ label: '__' },
			{ label: 'Delete', action: order.remove, icon: 'trash', type: 'critical' },
		];
		if (status === 'completed') {
			menu.splice(1, 0, {
				label: 'Receipt',
				icon: 'receipt',
				action: () => navigation.navigate('Receipt', { orderID: order._id }),
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
				onClose={() => {
					setMenuOpened(false);
				}}
				withinPortal={true}
				placement="bottom-end"
				items={menuItems}
			>
				<Icon
					name="ellipsisVertical"
					onPress={() => {
						setMenuOpened(true);
					}}
				/>
			</Dropdown>

			<Modal
				opened={editModalOpened}
				onClose={() => {
					setEditModalOpened(false);
				}}
				title={`Edit Order`}
				primaryAction={{
					label: 'Save',
					action: () => {
						console.log('save');
					},
				}}
				secondaryActions={[
					{
						label: 'Cancel',
						action: () => {
							setEditModalOpened(false);
						},
					},
				]}
			>
				<EditForm item={order} schema={schema} uiSchema={{}} />
			</Modal>
		</>
	);
};

export default Actions;
