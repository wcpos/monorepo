import * as React from 'react';

import pick from 'lodash/pick';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import useRestHttpClient from '../../../../hooks/use-rest-http-client';
import EditCustomer from '../../common/edit-form';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const Actions = ({ item: customer }: Props) => {
	const http = useRestHttpClient();
	const [menuOpened, setMenuOpened] = React.useState(false);
	const [editModalOpened, setEditModalOpened] = React.useState(false);

	/**
	 *
	 */
	const handleSync = async () => {
		// push
		const result = await http.post(`customers/${customer.id}`, customer.toJSON());
		if (result && result.data) {
			// parse raw data
			const data = customer.collection.parseRestResponse(result.data);
			customer.atomicPatch(data);
		}
	};

	/**
	 *
	 */
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
				opened={menuOpened}
				onClose={() => {
					setMenuOpened(false);
				}}
				withinPortal={true}
				placement="bottom-end"
				items={[
					{
						label: 'Edit',
						action: () => {
							setEditModalOpened(true);
						},
						icon: 'penToSquare',
					},
					{ label: 'Sync', action: handleSync, icon: 'arrowRotateRight' },
					{ label: '__' },
					{
						label: 'Delete',
						action: () => {
							console.log('delete');
						},
						icon: 'trash',
						type: 'critical',
					},
				]}
			>
				<Icon
					name="ellipsisVertical"
					onPress={() => {
						setMenuOpened(true);
					}}
				/>
			</Dropdown>

			<Modal
				opened={editModalOpened}
				onClose={() => {
					setEditModalOpened(false);
				}}
				title={`Edit Customer`}
				primaryAction={{
					label: 'Save',
					action: handleSync,
				}}
				secondaryActions={[
					{
						label: 'Cancel',
						action: () => {
							setEditModalOpened(false);
						},
					},
				]}
			>
				<EditCustomer item={customer} schema={schema} uiSchema={{}} />
			</Modal>
		</>
	);
};

export default Actions;
