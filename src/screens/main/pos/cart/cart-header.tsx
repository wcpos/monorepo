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
import { useGuestCustomer } from '../../hooks/use-guest-customer';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddCustomer } from '../hooks/use-add-customer';

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
	const { currentOrder } = useCurrentOrder();
	const { addCustomer } = useAddCustomer();
	const customerID = useObservableState(currentOrder.customer_id$, currentOrder.customer_id);
	previousCustomerID = customerID !== -1 ? customerID : previousCustomerID;

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
							onSelectCustomer={(customer) => addCustomer(customer)}
							autoFocus
							value={previousCustomerID}
						/>
					) : (
						<Customer />
					)}
				</ErrorBoundary>
			</Box>
			<ErrorBoundary>
				<AddCustomer onAdd={(customer) => addCustomer(customer)} />
			</ErrorBoundary>
			<ErrorBoundary>
				<UISettings uiSettings={uiSettings} title={t('Cart Settings', { _tags: 'core' })} />
			</ErrorBoundary>
		</Box>
	);
};

export default CartHeader;
