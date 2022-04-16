import * as React from 'react';
import Box from '@wcpos/components/src/box';
import useAppState from '@wcpos/hooks/src/use-app-state';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-new-customer';
import UISettings from '../../common/ui-settings';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CartHeaderProps {
	order: OrderDocument;
	ui: any;
}

const CartHeader = ({ order, ui }: CartHeaderProps) => {
	// const { storeDB } = useAppState();
	// const customer = storeDB.collections.customers.newDocument({ first_name: 'test' });

	return (
		<Box horizontal space="small" padding="small" align="center">
			<CustomerSelect
				onSelectCustomer={(val) => {
					console.log(val);
				}}
			/>
			<AddCustomer />
			<UISettings ui={ui} />
		</Box>
	);
};

export default CartHeader;
