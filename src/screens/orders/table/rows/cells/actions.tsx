import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import OrderModal from './modal';

interface Props {
	order: any;
}

const Actions = ({ order }: Props) => {
	const [visible, setVisible] = React.useState(false);

	const handleSync = () => {
		console.log('sync');
	};

	const handleDelete = () => {
		order.remove();
	};

	return (
		<>
			<Button title="Show" onPress={() => setVisible(true)} />
			<Button title="Sync" onPress={handleSync} />
			<Button title="Delete" onPress={handleDelete} />
			{visible && <OrderModal order={order} onClose={() => setVisible(false)} />}
		</>
	);
};

export default Actions;
