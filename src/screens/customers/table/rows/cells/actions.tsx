import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Modal from '@wcpos/common/src/components/modal';
import CustomerModal from './modal';
import EditCustomer from '../../../add-customer-modal';

interface Props {
	customer: any;
}

const Actions = ({ customer }: Props) => {
	const [showModal, setShowModal] = React.useState(false);

	const handleSync = () => {
		console.log('sync');
	};

	const handleDelete = () => {
		customer.remove();
	};

	return (
		<>
			<Button title="Edit" onPress={() => setShowModal(true)} />
			<Button title="Sync" onPress={handleSync} />
			<Button title="Delete" onPress={handleDelete} />
			{showModal && <EditCustomer onClose={() => setShowModal(false)} customer={customer} />}
		</>
	);
};

export default Actions;
