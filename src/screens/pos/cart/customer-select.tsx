import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import Text from '@wcpos/common/src/components/text';
import Pressable from '@wcpos/common/src/components/pressable';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface CustomerSelectProps {
	order?: OrderDocument;
}

const CustomerSelect = ({ order }: CustomerSelectProps) => {
	const [visible, setVisible] = React.useState(false);
	const { storeDB } = useAppState();
	const [customers, setCustomers] = React.useState<CustomerDocument[]>([]);

	React.useEffect(() => {
		async function fetch() {
			const c = await storeDB?.customers.find().exec();
			if (c) setCustomers(c);
		}
		fetch();
	}, []);

	return (
		<Popover
			hideBackdrop
			open={visible}
			onRequestClose={() => setVisible(false)}
			activator={<Button title="Select Customer" onPress={() => setVisible(!visible)} />}
		>
			{customers.map((customer) => {
				return (
					<Pressable
						key={customer._id}
						onPress={() => {
							order?.addCustomer(customer);
						}}
					>
						<Text>
							{customer.firstName} {customer.lastName}
						</Text>
					</Pressable>
				);
			})}
		</Popover>
	);
};

export default CustomerSelect;
