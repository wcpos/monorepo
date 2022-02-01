import * as React from 'react';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import useRestHttpClient from '@wcpos/common/src/hooks/use-rest-http-client';
import EditCustomer from '../../common/edit-modal';

type Props = {
	item: import('@wcpos/common/src/database').CustomerDocument;
};

const Actions = ({ item: customer }: Props) => {
	const { ref: modalRef, open, close } = useModal();
	const http = useRestHttpClient();

	const handleSync = async () => {
		// push
		const result = await http.post(`customers/${customer.id}`, customer.toJSON());

		debugger;
	};

	const handleDelete = () => {
		customer.remove();
	};

	return (
		<>
			<Dropdown
				items={[
					{ label: 'Edit', action: open },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: handleDelete },
				]}
			>
				<Icon name="ellipsisVertical" />
			</Dropdown>
			<Modal
				ref={modalRef}
				title="Edit Customer"
				primaryAction={{ label: 'Sync Customer', action: handleSync }}
				secondaryActions={[{ label: 'Cancel', action: close }]}
			>
				<EditCustomer item={customer} />
			</Modal>
		</>
	);
};

export default Actions;
