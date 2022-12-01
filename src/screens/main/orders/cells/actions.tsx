import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import pick from 'lodash/pick';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal, { useModal } from '@wcpos/components/src/modal';
import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../../../../hooks/use-rest-http-client';
import EditModal from '../../common/edit-modal';
import Receipt from '../../receipt';

interface Props {
	item: import('@wcpos/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const { ref: editModalRef, open: openEditModal, close: closeEditModal } = useModal();
	// const { ref: receiptModalRef, open: openReceiptModal, close: closeReceiptModal } = useModal();
	const navigation = useNavigation();
	const http = useRestHttpClient();

	/**
	 *
	 */
	const handleSync = React.useCallback(() => {
		// could use the link url?
		http
			.get(`/orders/${order._id}`)
			.then(({ data }) => {
				order.atomicPatch(data);
			})
			.catch((err) => {
				log.error(err);
			});
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
		order.atomicPatch({ status: 'pos-open' });
		// @ts-ignore
		navigation.navigate('POS', { currentOrder: order });
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
			{ label: 'Edit', action: openEditModal },
			{ label: 'Re-open', action: handleOpen },
			{ label: 'Sync', action: handleSync },
			{ label: 'Delete', action: order.remove },
		];
		if (order.status === 'completed') {
			menu.splice(1, 0, {
				label: 'Receipt',
				action: () => {
					if (order) {
						navigation.navigate('Receipt', { _id: order._id });
					}
				},
			});
		}

		return menu;
	}, [handleOpen, handleSync, navigation, openEditModal, order]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown items={menuItems}>
				<Icon name="ellipsisVertical" />
			</Dropdown>
			<Modal
				ref={editModalRef}
				title="Edit Order"
				primaryAction={{ label: 'Sync to server', action: saveOrder }}
				secondaryActions={[{ label: 'Cancel', action: closeEditModal }]}
			>
				<EditModal item={order} schema={schema} uiSchema={{}} />
			</Modal>
			{/* <Modal ref={receiptModalRef} title="Receipt">
				<Receipt order={order} />
			</Modal> */}
		</>
	);
};

export default Actions;
