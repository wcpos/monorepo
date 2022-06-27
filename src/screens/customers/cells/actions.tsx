import * as React from 'react';
import pick from 'lodash/pick';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal, { useModal } from '@wcpos/components/src/modal';
import useRestHttpClient from '@wcpos/hooks/src/use-rest-http-client';
import EditCustomer from '../../common/edit-modal';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
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

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		return {
			...customer.collection.schema.jsonSchema,
			properties: pick(customer.collection.schema.jsonSchema.properties, [
				'id',
				'email',
				'first_name',
				'last_name',
				'role',
				'username',
				'billing',
				'shipping',
				'meta_data',
			]),
		};
	}, [customer.collection.schema.jsonSchema]);

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
				<EditCustomer item={customer} schema={schema} uiSchema={{}} />
			</Modal>
		</>
	);
};

export default Actions;
