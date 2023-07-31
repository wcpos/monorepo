import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import Customer from './customer';
import { t } from '../../../../lib/translations';
import AddCustomer from '../../components/add-new-customer';
import CustomerSelect from '../../components/customer-select';
import UISettings from '../../components/ui-settings';
import useUI from '../../contexts/ui-settings';
import useGuestCustomer from '../../hooks/use-guest-customer';
import useCurrentOrder from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 * HACK: store previous customer, what's a better way to do this?
 */
let previousCustomerID = 0;

/**
 *
 */
const CartHeader = () => {
	const { uiSettings } = useUI('pos.cart');
	const theme = useTheme();
	// const { storeDB } = useLocalData();
	const { currentOrder, addCustomer } = useCurrentOrder();
	const customerID = useObservableState(currentOrder.customer_id$, currentOrder.customer_id);
	previousCustomerID = customerID !== -1 ? customerID : previousCustomerID;
	const guestCustomer = useGuestCustomer();

	/**
	 *
	 */
	const handleCustomerSelect = React.useCallback(
		(selectedCustomer: CustomerDocument) => {
			/** Special case for Guest */
			if (selectedCustomer.id === 0) {
				return addCustomer(guestCustomer);
			}

			const customerJSON = selectedCustomer.toMutableJSON();
			return addCustomer({
				customer_id: customerJSON.id,
				billing: {
					...(customerJSON.billing || {}),
					email: customerJSON?.billing?.email || customerJSON?.email,
					first_name:
						customerJSON?.billing?.first_name || customerJSON.first_name || customerJSON?.username,
					last_name: customerJSON?.billing?.last_name || customerJSON.last_name,
				},
				shipping: customerJSON.shipping,
			});
		},
		[addCustomer, guestCustomer]
	);

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
				height: 50,
				zIndex: 1, // this makes sure the customer select is on top of the cart
			}}
		>
			<Box fill>
				<ErrorBoundary>
					{customerID === -1 ? (
						<CustomerSelect
							onSelectCustomer={handleCustomerSelect}
							autoFocus
							value={previousCustomerID}
						/>
					) : (
						<Customer />
					)}
				</ErrorBoundary>
			</Box>
			<ErrorBoundary>
				<AddCustomer onAdd={handleCustomerSelect} />
			</ErrorBoundary>
			<ErrorBoundary>
				<UISettings uiSettings={uiSettings} title={t('Cart Settings', { _tags: 'core' })} />
			</ErrorBoundary>
		</Box>
	);
};

export default CartHeader;
