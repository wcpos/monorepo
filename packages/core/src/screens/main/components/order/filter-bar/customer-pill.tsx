import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
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

	/**
	 * @FIXME - if the customers are cleared, it's possible that the customer will be null
	 */
	if (!customer && isActive) {
		customer = { id: customerID } as CustomerDocument;
	}
	const customerEntity = isActive ? customer : null;
	const isLoading = isActive && !!isCustomerLoading;

	/**
	 *
	 */
	return (
		<Combobox
			onValueChange={(option) => {
				if (!option) return;
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
