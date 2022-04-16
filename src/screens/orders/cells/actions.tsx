import * as React from 'react';
import { useNavigation } from '@react-navigation/native';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal, { useModal } from '@wcpos/components/src/modal';
import useRestHttpClient from '@wcpos/hooks/src/use-rest-http-client';
import EditModal from '../../common/edit-modal';

interface Props {
	item: import('@wcpos/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const { ref, open, close } = useModal();
	const navigation = useNavigation();
	const http = useRestHttpClient();

	const handleSync = () => {
		// could use the link url?
		http
			.get(`/orders/${order._id}`)
			.then(({ data }) => {
				order.atomicPatch(data);
			})
			.catch(() => {
				debugger;
			});
	};

	const handleOpen = React.useCallback(() => {
		order.atomicPatch({ status: 'pos-open' });
		// @ts-ignore
		navigation.navigate('POS', { currentOrder: order });
	}, [navigation, order]);

	return (
		<>
			<Dropdown
				items={[
					{ label: 'Show', action: open },
					{ label: 'Open in Cart', action: handleOpen },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: order.remove },
				]}
			>
				<Icon name="ellipsisVertical" />
			</Dropdown>
			<Modal ref={ref} title="Edit Order">
				<EditModal item={order} />
			</Modal>
		</>
	);
};

export default Actions;
