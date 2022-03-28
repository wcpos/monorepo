import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-new-customer';
import UISettings from '../../common/ui-settings';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

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
