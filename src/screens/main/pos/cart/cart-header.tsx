import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import Customer from './customer';
import { useT } from '../../../../contexts/translations';
import AddCustomer from '../../components/add-new-customer';
import CustomerSelect from '../../components/customer-select';
import UISettings from '../../components/ui-settings';
import useUI from '../../contexts/ui-settings';
import { useAddCustomer } from '../hooks/use-add-customer';

/**
 *
 */
const CartHeader = () => {
	const { uiSettings } = useUI('pos.cart');
	const theme = useTheme();
	const { addCustomer } = useAddCustomer();
	const [showCustomerSelect, setShowCustomerSelect] = React.useState(false);
	const t = useT();

	/**
	 *
	 */
	const handleSelectCustomer = React.useCallback(
		(customer) => {
			if (customer) {
				addCustomer(customer);
			}
			setShowCustomerSelect(false);
		},
		[addCustomer]
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
					{showCustomerSelect ? (
						<CustomerSelect onSelectCustomer={handleSelectCustomer} autoFocus />
					) : (
						<Customer setShowCustomerSelect={setShowCustomerSelect} />
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
