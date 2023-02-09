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
import useCurrentOrder from '../contexts/current-order';

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
	const { addCustomer } = useCurrentOrder();

	/**
	 *
	 */
	const handleCustomerSelect = React.useCallback(
		(selectedCustomer: CustomerDocument) => {
			/** Special case for Guest */
			if (selectedCustomer.id === 0) {
				return addCustomer({ customer_id: 0, billing: {}, shipping: {} });
			}

			const customerJSON = selectedCustomer.toJSON();
			return addCustomer({
				customer_id: customerJSON.id,
				billing: {
					...(customerJSON.billing || {}),
					email: customerJSON?.billing?.email || customerJSON?.email,
					first_name: customerJSON?.billing?.first_name || customerJSON?.username,
				},
				shipping: customerJSON.shipping,
			});
		},
		[addCustomer]
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
