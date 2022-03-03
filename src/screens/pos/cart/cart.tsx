import * as React from 'react';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import Box from '@wcpos/common/src/components/box';
import Button from '@wcpos/common/src/components/button';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import useSnackbar from '@wcpos/common/src/components/snackbar';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-edit-customer';
import UISettings from '../../common/ui-settings';
import Totals from './totals';
import PayButton from './pay-button';
import Table from './table';
import FeeAndShipping from './fee-and-shipping';
import OrderMetaButton from './order-meta-button';
import SaveButton from './save-button';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface CartProps {
	order: OrderDocument;
}

const Cart = ({ order }: CartProps) => {
	const ui = useObservableSuspense(useUIResource('pos.cart'));
	const [items] = useObservableState(() => {
		return order.getCart$();
	}, []);
	const addSnackbar = useSnackbar();

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
			{items.length > 0 && (
				<Box fill>
					<Table items={items} ui={ui} />
				</Box>
			)}
			<Box>
				<FeeAndShipping order={order} />
			</Box>
			{items.length > 0 && (
				<>
					<Box>
						<Totals order={order} ui={ui} />
					</Box>
					<Box horizontal space="small" padding="small" align="center">
						<Button
							title="Add Note"
							background="outline"
							onPress={() => {
								order.atomicPatch({ customer_note: 'This is a note!' });
							}}
						/>
						<OrderMetaButton order={order} />
						<SaveButton order={order} />
						<Button
							title="Snackbar"
							background="outline"
							onPress={() => {
								addSnackbar({ message: 'This is a snackbar!' });
							}}
						/>
					</Box>
					<Box horizontal>
						<Button
							fill
							size="large"
							title="Void"
							onPress={() => {
								order.remove();
							}}
							type="critical"
							// style={{ width: '33%' }}
						/>
						<PayButton order={order} />
					</Box>
				</>
			)}
		</Box>
	);
};

export default Cart;
