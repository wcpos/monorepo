import * as React from 'react';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import EditCustomer from '../add-customer-modal';

type Props = {
	item: import('@wcpos/common/src/database').CustomerDocument;
};

const Actions = ({ item: customer }: Props) => {
	const [showModal, setShowModal] = React.useState(false);

	const handleSync = () => {
		// @ts-ignore
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
				items={[
					{ label: 'Edit', action: () => setShowModal(true) },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: handleDelete },
				]}
			>
				<Icon name="ellipsisVertical" />
			</Dropdown>
			{showModal && <EditCustomer onClose={() => setShowModal(false)} customer={customer} />}
		</>
	);
};

export default Actions;
