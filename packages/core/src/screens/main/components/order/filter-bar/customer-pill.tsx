import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { extractNameFromJSON } from '../../../hooks/use-customer-name-format/helpers';
import { useCustomerNameFormat } from '../../../hooks/use-customer-name-format';
import { CustomerSearch } from '../../customer-select';

interface CustomerPillProps {
	query: Query<CustomerCollection>;
	resource: ObservableResource<CustomerDocument>;
	customerID?: number;
}

type CustomerWithLoadingMarker = CustomerDocument & { __isLoading?: boolean };

/**
 *
 */
export function CustomerPill({ query, resource, customerID }: CustomerPillProps) {
	let customer = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();
	const t = useT();
	const isCustomerLoading = (customer as CustomerWithLoadingMarker | null)?.__isLoading;
	const isActive = customerID !== null && customerID !== undefined;
	const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerDocument | null>(null);

	/**
	 * @FIXME - if the customers are cleared, it's possible that the customer will be null
	 */
	if (!customer && isActive) {
		customer = { id: customerID } as CustomerDocument;
	}

	React.useEffect(() => {
		if (!isActive) {
			setSelectedCustomer(null);
			return;
		}

		setSelectedCustomer((current) => (current?.id === customerID ? current : null));
	}, [customerID, isActive]);

	const customerEntity = React.useMemo(() => {
		if (!isActive) {
			return null;
		}

		if (customer && (customer.id === 0 || !!extractNameFromJSON(customer))) {
			return customer;
		}

		if (selectedCustomer?.id === customerID) {
			return selectedCustomer;
		}

		return customer ?? null;
	}, [customer, customerID, isActive, selectedCustomer]);
	const isLoading = isActive && !!isCustomerLoading;

	/**
	 *
	 */
	return (
		<Combobox<CustomerDocument>
			onValueChange={(option) => {
				if (!option) return;
				setSelectedCustomer(option.item ?? null);
				query.where('customer_id').equals(toNumber(option.value)).exec();
			}}
		>
			<ComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="user"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => query.removeWhere('customer_id').exec()}
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
