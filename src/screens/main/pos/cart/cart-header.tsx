import * as React from 'react';

import { useTheme } from 'styled-components/native';

import { Box } from '@wcpos/tailwind/src/box';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';

import Customer from './customer';
import { useT } from '../../../../contexts/translations';
import { AddNewCustomer } from '../../components/customer/add-new';
import CustomerSelect from '../../components/customer-select';
import UISettings from '../../components/ui-settings';
import { useUISettings } from '../../contexts/ui-settings';
import { useAddCustomer } from '../hooks/use-add-customer';

/**
 *
 */
const CartHeader = () => {
	const { uiSettings } = useUISettings('pos-cart');
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
		<HStack>
			<Box className="p-0 flex-1">
				<ErrorBoundary>
					{showCustomerSelect ? (
						<CustomerSelect onSelectCustomer={handleSelectCustomer} autoFocus />
					) : (
						<Customer setShowCustomerSelect={setShowCustomerSelect} />
					)}
				</ErrorBoundary>
			</Box>
			<ErrorBoundary>
				<AddNewCustomer onAdd={(customer) => addCustomer(customer)} />
			</ErrorBoundary>
			<ErrorBoundary>
				<UISettings uiSettings={uiSettings} title={t('Cart Settings', { _tags: 'core' })} />
			</ErrorBoundary>
		</HStack>
	);
};

export default CartHeader;
