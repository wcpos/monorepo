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
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';

import { AddNewCustomer } from './add-customer';
import { Customer } from './customer';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../../contexts/translations';
import { CustomerSearch } from '../../components/customer-select';
import { UISettingsDialog } from '../../components/ui-settings';
import { useLicense } from '../../hooks/use-license';
import { useAddCustomer } from '../hooks/use-add-customer';

/**
 *
 */
export const CartHeader = () => {
	const { addCustomer } = useAddCustomer();
	const [showCustomerSelect, setShowCustomerSelect] = React.useState(false);
	const t = useT();
	const triggerRef = React.useRef(null);
	const { isPro } = useLicense();

	/**
	 *
	 */
	const handleSelectCustomer = React.useCallback(
		async ({ item: customer }) => {
			if (customer) {
				await addCustomer(customer);
			}
			setShowCustomerSelect(false);
		},
		[addCustomer]
	);

	/**
	 *
	 */
	React.useEffect(() => {
		if (showCustomerSelect && triggerRef?.current) {
			triggerRef.current.open();
		}
	}, [showCustomerSelect]);

	/**
	 * HACK: If the combobox closes without selecting a customer, we need to go back to the customer pill.
	 * But! If we go back to the customer pill on select, the previous customer will flash before the new one is set.
	 * So we delay the close handler by 10ms to allow the new customer to be set before hiding the combobox.
	 */
	const delayedCloseHandler = React.useCallback((opened) => {
		if (!opened) {
			setTimeout(() => {
				setShowCustomerSelect(false);
			}, 10);
		}
	}, []);

	/**
	 *
	 */
	return (
		<HStack>
			<HStack className="flex-wrap flex-1">
				<Text className="font-bold">{t('Customer', { _tags: 'core' })}:</Text>
				<ErrorBoundary>
					{showCustomerSelect ? (
						<Combobox onValueChange={handleSelectCustomer} onOpenChange={delayedCloseHandler}>
							<ComboboxTriggerPrimitive ref={triggerRef} asChild>
								<ButtonPill size="xs" leftIcon="user" variant="muted">
									<ButtonText>{t('Select Customer', { _tags: 'core' })}</ButtonText>
								</ButtonPill>
							</ComboboxTriggerPrimitive>
							<ComboboxContent>
								<CustomerSearch withGuest />
							</ComboboxContent>
						</Combobox>
					) : (
						<Customer setShowCustomerSelect={setShowCustomerSelect} />
					)}
				</ErrorBoundary>
			</HStack>
			{isPro ? (
				<AddNewCustomer />
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<IconButton disabled name="userPlus" />
					</TooltipTrigger>
					<TooltipContent>
						<Text>{t('Upgrade to Pro', { _tags: 'core' })}</Text>
					</TooltipContent>
				</Tooltip>
			)}
			<UISettingsDialog title={t('Cart Settings', { _tags: 'core' })}>
				<UISettingsForm />
			</UISettingsDialog>
		</HStack>
	);
};
