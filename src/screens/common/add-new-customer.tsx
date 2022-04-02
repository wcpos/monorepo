import * as React from 'react';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import pick from 'lodash/pick';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Tabs from '@wcpos/common/src/components/tabs';
import Tree from '@wcpos/common/src/components/tree';
import Icon from '@wcpos/common/src/components/icon';
import Form from '@wcpos/common/src/components/form';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import useRestHttpClient from '@wcpos/common/src/hooks/use-rest-http-client';

export interface AddEditCustomerProps {
	// customer: import('@wcpos/common/src/database').CustomerDocument;
}

/**
 *
 */
const AddEditCustomer = ({}: AddEditCustomerProps) => {
	const { ref, open, close } = useModal();
	const [index, setIndex] = React.useState(0);
	const [customerData, setCustomerData] = React.useState({});
	const { storeDB } = useAppState();
	const customerCollection = storeDB.collections.customers;
	const http = useRestHttpClient();
	const [extraErrors, setExtraErrors] = React.useState();

	const handleSave = async () => {
		const result = await http('customers', {
			method: 'post',
			data: customerData,
		}).catch((error) => {
			if (error.response) {
				const { data } = error.response;
				const { data: d, code, message } = data;
				if (d.params) {
					const param = d.params[0];
					setExtraErrors({
						[param]: {
							__errors: [message],
						},
					});
				} else {
					setExtraErrors({
						__errors: [message],
					});
				}
			}
		});

		if (result?.status === 201 || result?.status === 200) {
			const newCustomer = await customerCollection.insert(result.data);
			if (newCustomer) {
				close();
			}
		}
	};

	/**
	 *
	 */
	const handleChange = React.useCallback((changes) => {
		setCustomerData(changes);
	}, []);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		return {
			...customerCollection.schema.jsonSchema,
			properties: pick(customerCollection.schema.jsonSchema.properties, [
				'id',
				'email',
				'first_name',
				'last_name',
				'role',
				'username',
				'password',
				'billing',
				'shipping',
				'billing',
				'meta_data',
			]),
		};
	}, [customerCollection.schema.jsonSchema]);

	const renderScene = ({ route }) => {
		switch (route.key) {
			case 'form':
				return (
					<Form
						schema={schema}
						formData={customerData}
						onChange={handleChange}
						extraErrors={extraErrors}
						uiSchema={{
							id: { 'ui:readonly': true },
							billing: { 'ui:collapsible': 'closed' },
							shipping: { 'ui:collapsible': 'closed' },
							meta_data: { 'ui:collapsible': 'closed' },
						}}
					/>
				);
			case 'json':
				return <Tree data={customerData} />;
			default:
				return null;
		}
	};

	const routes = [
		{ key: 'form', title: 'Form' },
		{ key: 'json', title: 'JSON' },
	];

	useWhyDidYouUpdate('AddEditCustomer', {
		customerData,
		index,
		routes,
		ref,
		open,
		close,
		handleSave,
		handleChange,
		renderScene,
		setIndex,
	});

	return (
		<>
			<Icon name="userPlus" onPress={open} tooltip="Add new customer" />
			<Modal
				ref={ref}
				title="Add New Customer"
				primaryAction={{ label: 'Add Customer', action: handleSave }}
				secondaryActions={[{ label: 'Cancel', action: close }]}
			>
				<Tabs<typeof routes[number]>
					navigationState={{ index, routes }}
					renderScene={renderScene}
					onIndexChange={setIndex}
				/>
			</Modal>
		</>
	);
};

export default AddEditCustomer;
