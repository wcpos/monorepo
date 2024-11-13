import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Combobox,
	ComboboxTriggerPrimitive,
	ComboboxContent,
} from '@wcpos/components/src/combobox';
import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import useCustomerNameFormat from '../../../hooks/use-customer-name-format';
import { CustomerSearch } from '../../customer-select';

interface CustomerPillProps {
	query: Query<CustomerCollection>;
	resource: ObservableResource<CustomerDocument>;
	customerID?: number;
}

/**
 *
 */
const CustomerPill = ({ query, resource, customerID }: CustomerPillProps) => {
	let customer = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();
	const t = useT();

	/**
	 * @FIXME - if the customers are cleared, it's possible that the customer will be null
	 */
	if (!customer && customerID) {
		customer = { id: customerID };
	}

	/**
	 *
	 */
	return (
		<Combobox
			onValueChange={({ value }) => {
				query.where('customer_id').equals(toNumber(value)).exec();
			}}
		>
			<ComboboxTriggerPrimitive asChild>
				<ButtonPill
					size="xs"
					leftIcon="user"
					variant={customer ? 'default' : 'muted'}
					removable={!!customer}
					onRemove={() => query.removeWhere('customer_id').exec()}
				>
					<ButtonText>
						{customer ? format(customer) : t('Select Customer', { _tags: 'core' })}
					</ButtonText>
				</ButtonPill>
			</ComboboxTriggerPrimitive>
			<ComboboxContent>
				<CustomerSearch withGuest />
			</ComboboxContent>
		</Combobox>
	);
};

export default CustomerPill;
