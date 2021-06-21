import * as React from 'react';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import EditCustomer from '../../../add-customer-modal';

interface Props {
	customer: any;
}

const Actions = ({ customer }: Props) => {
	const [showModal, setShowModal] = React.useState(false);

	const handleSync = () => {
		const replicationState = customer.syncRestApi({
			push: {},
		});
		replicationState.run(false);
	};

	const handleDelete = () => {
		customer.remove();
	};

	return (
		<>
			<Dropdown
				activator={<Icon name="more" />}
				items={[
					{ label: 'Edit', action: () => setShowModal(true) },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: handleDelete },
				]}
			/>
			{showModal && <EditCustomer onClose={() => setShowModal(false)} customer={customer} />}
		</>
	);
};

export default Actions;
