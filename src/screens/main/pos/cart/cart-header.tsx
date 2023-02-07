import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import Customer from './customer';
import Settings from './settings';
import useStore from '../../../../contexts/store';
import AddCustomer from '../../components/add-new-customer';
import CustomerSelect from '../../components/customer-select';

type OrderDocument = import('@wcpos/database').OrderDocument;
type CustomerDocument = import('@wcpos/database').CustomerDocument;

interface CartHeaderProps {
	order: OrderDocument;
}

/**
 *
 */
const CartHeader = ({ order }: CartHeaderProps) => {
	const theme = useTheme();
	const { storeDB } = useStore();
	const customerID = useObservableState(order.customer_id$, order.customer_id);

	/**
	 *
	 */
	const handleCustomerSelect = React.useCallback(
		(selectedCustomer: CustomerDocument) => {
			const billingEmail = selectedCustomer?.billing?.email || selectedCustomer?.email;
			const firstName = selectedCustomer?.billing?.first_name || selectedCustomer?.username;

			order.patch({
				customer_id: selectedCustomer.id,
				billing: { ...selectedCustomer.billing, email: billingEmail, first_name: firstName },
				shipping: selectedCustomer.shipping,
			});
		},
		[order]
	);

	/**
	 *
	 */
	useWhyDidYouUpdate('Cart Header', { order, theme, storeDB });

	/**
	 *
	 */
	return (
		<Box
			horizontal
			space="small"
			padding="small"
			align="center"
			style={{
				backgroundColor: theme.colors.grey,
				borderTopLeftRadius: theme.rounding.medium,
				borderTopRightRadius: theme.rounding.medium,
				height: 51,
				zIndex: 1, // this makes sure the customer select is on top of the cart
			}}
		>
			<Box fill>
				<ErrorBoundary>
					{customerID !== -1 ? (
						<Customer order={order} />
					) : (
						<CustomerSelect onSelectCustomer={handleCustomerSelect} />
					)}
				</ErrorBoundary>
			</Box>
			<ErrorBoundary>
				<AddCustomer />
			</ErrorBoundary>
			<ErrorBoundary>
				<Settings />
			</ErrorBoundary>
		</Box>
	);
};

export default CartHeader;
