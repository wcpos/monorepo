import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import Segment from '@wcpos/common/src/components/segment';
import Box from '@wcpos/common/src/components/box';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-edit-customer';
import UISettings from '../../common/ui-settings';
import Totals from './totals';
import Buttons from './buttons';
import Table from './table';
import FeeAndShipping from './fee-and-shipping';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface CartProps {
	order: OrderDocument;
}

const Cart = ({ order }: CartProps) => {
	const ui = useObservableSuspense(useUIResource('pos.cart'));

	return (
		<Box raised rounding="medium" style={{ height: '100%', backgroundColor: 'white' }}>
			<Box horizontal space="small" padding="small" align="center">
				<CustomerSelect
					onSelectCustomer={(val) => {
						console.log(val);
					}}
				/>
				<AddCustomer />
				<UISettings ui={ui} />
			</Box>
			<Box>
				<Table order={order} ui={ui} />
			</Box>
			<Box>
				<FeeAndShipping order={order} />
			</Box>
			<Box>
				<Totals order={order} ui={ui} />
			</Box>
			{/* <Box
				primaryAction={{ label: order.total, action: () => {}, type: 'success' }}
				secondaryActions={[{ label: 'Void', action: () => {}, type: 'critical' }]}
			/> */}
		</Box>
	);
};

export default Cart;
