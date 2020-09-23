import React from 'react';
import Button from '../../../../../components/button';
import Modal from '../../../../../components/modal';
import CustomerModal from './modal';

interface Props {
	customer: any;
}

const Actions = ({ customer }: Props) => {
	const [visible, setVisible] = React.useState(false);

	const handleSync = () => {
		console.log('sync');
	};

	const handleDelete = () => {
		customer.remove();
	};

	return (
		<>
			<Button title="Show" onPress={() => setVisible(true)} />
			<Button title="Sync" onPress={handleSync} />
			<Button title="Delete" onPress={handleDelete} />
			{visible && (
				<Modal visible={visible}>
					<CustomerModal customer={customer} setVisible={setVisible} />
				</Modal>
			)}
		</>
	);
};

export default Actions;
