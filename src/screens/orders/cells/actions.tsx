import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import OrderModal from './modal';

interface Props {
	item: import('@wcpos/common/src/database').OrderDocument;
}

const Actions = ({ item: order }: Props) => {
	const [visible, setVisible] = React.useState(false);

	const handleSync = () => {
		console.log('sync');
	};

	const handleDelete = () => {
		order.remove();
	};

	return (
		<>
			<Dropdown
				items={[
					{ label: 'Show', action: () => setVisible(true) },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: handleDelete },
				]}
				activator={<Icon name="more" />}
			/>
			{visible && <OrderModal order={order} onClose={() => setVisible(false)} />}
		</>
	);
};

export default Actions;
