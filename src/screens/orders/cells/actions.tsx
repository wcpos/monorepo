import * as React from 'react';
import { useNavigation } from '@react-navigation/native';
import pick from 'lodash/pick';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal, { useModal } from '@wcpos/components/src/modal';
import useRestHttpClient from '@wcpos/hooks/src/use-rest-http-client';
import EditModal from '../../common/edit-modal';
import Receipt from '../../receipt';

interface Props {
	item: import('@wcpos/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const { ref: editModalRef, open: openEditModal, close: closeEditModal } = useModal();
	const { ref: receiptModalRef, open: openReceiptModal, close: closeReceiptModal } = useModal();
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
			.catch(() => {
				debugger;
			});
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
			menu.splice(1, 0, { label: 'Receipt', action: openReceiptModal });
		}

		return menu;
	}, [handleOpen, handleSync, openEditModal, openReceiptModal, order.remove, order.status]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown items={menuItems}>
				<Icon name="ellipsisVertical" />
			</Dropdown>
			<Modal ref={editModalRef} title="Edit Order">
				<EditModal item={order} schema={schema} uiSchema={{}} />
			</Modal>
			<Modal ref={receiptModalRef} title="Receipt">
				<Receipt order={order} />
			</Modal>
		</>
	);
};

export default Actions;
