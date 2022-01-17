import * as React from 'react';
import { useNavigation } from '@react-navigation/native';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import EditModal from '../../common/edit-modal';

interface Props {
	item: import('@wcpos/common/src/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const { ref, open, close } = useModal();
	const navigation = useNavigation();

	const handleSync = () => {
		console.log('sync');
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
