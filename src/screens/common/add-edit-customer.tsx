import * as React from 'react';
import { View } from 'react-native';
import { useObservableSuspense } from 'observable-hooks';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import TextInput from '@wcpos/common/src/components/textinput';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Tabs from '@wcpos/common/src/components/tabs';
import Tree from '@wcpos/common/src/components/tree';
import Icon from '@wcpos/common/src/components/icon';
import Form from '@wcpos/common/src/components/form';

export interface AddEditCustomerProps {
	customer?: import('@wcpos/common/src/database').CustomerDocument;
}

const AddEditCustomer = (props: AddEditCustomerProps) => {
	const { storeDB } = useAppState();
	const customer = props.customer || storeDB.collections.customers.newDocument();
	const { ref, open, close } = useModal();
	const [index, setIndex] = React.useState(0);
	const [firstName, setFirstName] = React.useState(customer?.firstName || '');
	const [email, setEmail] = React.useState(customer?.email || '');

	const title = customer.localID ? 'Edit Customer' : 'Add Customer';

	const handleSave = async () => {
		const currentCustomer = customer;
		if (!currentCustomer) {
			const customersCollection = storeDB?.collections.customers;
			// @ts-ignore
			const currentCustomer = await customersCollection?.insert({ firstName, email });
		} else {
			currentCustomer.atomicPatch({ firstName, email });
		}

		if (currentCustomer) {
			// @ts-ignore
			const replicationState = currentCustomer.syncRestApi({
				push: {},
			});
			replicationState.error$.subscribe((err: any) => {
				if (err.code === 401) {
					// showAuthLogin();
					console.log('need to login');
				}
			});
			replicationState.run(false);
		}
	};

	const renderScene = ({ route }) => {
		switch (route.key) {
			case 'form':
				return <Form schema={customer.collection.schema.jsonSchema} formData={customer.toJSON()} />;
			case 'json':
				return customer ? <Tree data={customer.toJSON()} /> : null;
			default:
				return null;
		}
	};

	const routes = [
		{ key: 'form', title: 'Form' },
		{ key: 'json', title: 'JSON' },
	];

	return (
		<>
			<Icon name="userPlus" onPress={open} tooltip="Add new customer" />
			<Modal
				ref={ref}
				title={title}
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
