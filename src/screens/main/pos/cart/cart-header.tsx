import * as React from 'react';
import { View } from 'react-native';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Combobox,
	ComboboxContent,
	ComboboxTriggerPrimitive,
} from '@wcpos/components/src/combobox';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';

import { Customer } from './customer';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../../contexts/translations';
import { AddNewCustomer } from '../../components/customer/add-new';
import { CustomerSearch } from '../../components/customer-select';
import { UISettingsDialog } from '../../components/ui-settings';
import { useAddCustomer } from '../hooks/use-add-customer';

/**
 *
 */
export const CartHeader = () => {
	const { addCustomer } = useAddCustomer();
	const [showCustomerSelect, setShowCustomerSelect] = React.useState(false);
	const t = useT();

	/**
	 *
	 */
	const handleSelectCustomer = React.useCallback(
		({ item: customer }) => {
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
			<Text className="font-bold">{t('Customer', { _tags: 'core' })}:</Text>
			<View className="flex-1 flex-row items-center">
				<ErrorBoundary>
					{showCustomerSelect ? (
						<Combobox onValueChange={handleSelectCustomer}>
							<ComboboxTriggerPrimitive asChild>
								<ButtonPill size="xs" leftIcon="user" variant="muted">
									<ButtonText>{t('Select Customer', { _tags: 'core' })}</ButtonText>
								</ButtonPill>
							</ComboboxTriggerPrimitive>
							<ComboboxContent>
								<CustomerSearch />
							</ComboboxContent>
						</Combobox>
					) : (
						<Customer setShowCustomerSelect={setShowCustomerSelect} />
					)}
				</ErrorBoundary>
			</View>
			<AddNewCustomer onAdd={(customer) => addCustomer(customer)} />
			<UISettingsDialog title={t('Cart Settings', { _tags: 'core' })}>
				<UISettingsForm />
			</UISettingsDialog>
		</HStack>
	);
};
