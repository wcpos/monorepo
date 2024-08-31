import * as React from 'react';

import { Box } from '@wcpos/components/src/box';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';

import Customer from './customer';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../../contexts/translations';
import { AddNewCustomer } from '../../components/customer/add-new';
import { CustomerSelect } from '../../components/customer-select';
import { UISettingsDialog } from '../../components/ui-settings';
import { useUISettings } from '../../contexts/ui-settings';
import { useAddCustomer } from '../hooks/use-add-customer';

/**
 *
 */
export const CartHeader = () => {
	const { uiSettings } = useUISettings('pos-cart');
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
						<CustomerSelect />
					) : (
						<Customer setShowCustomerSelect={setShowCustomerSelect} />
					)}
				</ErrorBoundary>
			</Box>
			<AddNewCustomer onAdd={(customer) => addCustomer(customer)} />
			<UISettingsDialog title={t('Cart Settings', { _tags: 'core' })}>
				<UISettingsForm />
			</UISettingsDialog>
		</HStack>
	);
};
