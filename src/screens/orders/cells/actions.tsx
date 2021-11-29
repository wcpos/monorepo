import * as React from 'react';
import { useNavigation } from '@react-navigation/native';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import OrderModal from './modal';

interface Props {
	item: import('@wcpos/common/src/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const [visible, setVisible] = React.useState(false);
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
					{ label: 'Show', action: () => setVisible(true) },
					{ label: 'Open in Cart', action: handleOpen },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: order.remove },
				]}
				activator={<Icon name="ellipsisVertical" />}
			/>
			{visible && <OrderModal order={order} onClose={() => setVisible(false)} />}
		</>
	);
};

export default Actions;
