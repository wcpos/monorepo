import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-edit-customer';
import UISettings from '../../common/ui-settings';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface CartHeaderProps {
	order: OrderDocument;
	ui: any;
}

const CartHeader = ({ order, ui }: CartHeaderProps) => {
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
