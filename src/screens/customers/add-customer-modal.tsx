import * as React from 'react';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Tabs from '@wcpos/common/src/components/tabs';
import Tree from '@wcpos/common/src/components/tree';

export interface AddCustomerProps {
	onClose: () => void;
	customer?: import('@wcpos/common/src/database').CustomerDocument;
}

const AddCustomer = ({ onClose, customer }: AddCustomerProps) => {
	const { storeDB } = useAppState();
	const [firstName, setFirstName] = React.useState(customer?.firstName);
	const [email, setEmail] = React.useState(customer?.email);
	const [selected, setSelected] = React.useState(0);

	const title = customer ? 'Edit Customer' : 'Add Customer';

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

	const content =
		selected === 0 ? (
			<Dialog.Section>
				<TextInput label="First Name" value={firstName} onChange={setFirstName} />
				<TextInput label="Email" value={email} onChange={setEmail} />
			</Dialog.Section>
		) : (
			<Dialog.Section>{customer ? <Tree data={customer.toJSON()} /> : null}</Dialog.Section>
		);

	return (
		<Dialog
			title={title}
			open
			onClose={onClose}
			primaryAction={{ label: 'Save', action: handleSave }}
		>
			<Tabs tabs={['Form', 'JSON']} selected={selected} onSelect={setSelected}>
				{content}
			</Tabs>
		</Dialog>
	);
};

export default AddCustomer;
