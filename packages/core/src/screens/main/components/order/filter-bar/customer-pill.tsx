import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
import type { EngineRecord } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';

import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';
import { useCustomerNameFormat } from '../../../hooks/use-customer-name-format';
import { CustomerSearch } from '../../customer-select';
import { isIdOnlyCustomerEntity, resolveCustomerPillEntity } from './customer-filter-utils';

import type { CustomerData } from '../../../hooks/use-customer-name-format/helpers';

interface CustomerPillProps {
	resource: ObservableResource<EngineRecord<'customers'> | null>;
	guestCustomer: CustomerData;
	onMissing?: () => void;
}

/**
 *
 */
export function CustomerPill({ resource, guestCustomer, onMissing }: CustomerPillProps) {
	const customerID = useQueryState<'orders', number | undefined>(
		(state) => state.filters.customer_id
	);
	const actions = useQueryStateActions<'orders'>();
	const resolvedCustomer = useObservableSuspense(resource);
	let customer = isGuestCustomer(customerID) ? guestCustomer : resolvedCustomer?.payload;
	const { format } = useCustomerNameFormat();
	const t = useT();
	const isActive = customerID !== null && customerID !== undefined;
	const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerData | null>(null);

	React.useEffect(() => {
		// Missing labels escalate through the engine demand seam after the resident lookup settles.
		if (isActive && !isGuestCustomer(customerID) && !resolvedCustomer) onMissing?.();
	}, [customerID, isActive, onMissing, resolvedCustomer]);

	/**
	 * @FIXME - if the customers are cleared, it's possible that the customer will be null
	 */
	if (!customer && isActive) {
		customer = { id: customerID };
	}

	// Reconcile the local selection with the active customerID. Implemented as the
	// React "adjust state during render" pattern (tracking the previous customerID)
	// rather than an effect, so it never sets state inside useEffect.
	const [prevCustomerID, setPrevCustomerID] = React.useState(customerID);
	if (customerID !== prevCustomerID) {
		setPrevCustomerID(customerID);
		if (!isActive) {
			setSelectedCustomer(null);
		} else {
			setSelectedCustomer((current) => (current?.id === customerID ? current : null));
		}
	}

	const customerEntity = React.useMemo(
		() =>
			resolveCustomerPillEntity({
				customer,
				selectedCustomer,
				customerID,
				isActive,
			}),
		[customer, customerID, isActive, selectedCustomer]
	);
	const isLoading = isActive && isIdOnlyCustomerEntity(customerEntity);

	/**
	 *
	 */
	return (
		<Combobox<CustomerData>
			onValueChange={(option) => {
				if (!option) return;
				setSelectedCustomer(option.item ?? null);
				actions.setFilter('customer_id', Number(option.value));
			}}
		>
			<ComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="user"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => actions.clearFilter('customer_id')}
				>
					<ButtonText>
						{isLoading
							? t('common.loading')
							: customerEntity
								? format(customerEntity)
								: t('common.select_customer')}
					</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<CustomerSearch withGuest />
			</ComboboxContent>
		</Combobox>
	);
}
