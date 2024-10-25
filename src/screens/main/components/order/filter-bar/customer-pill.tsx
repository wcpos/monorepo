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
import { CustomerSearch } from '../../../components/customer-select';
import useCustomerNameFormat from '../../../hooks/use-customer-name-format';

interface CustomerPillProps {
	query: Query<CustomerCollection>;
	resource: ObservableResource<CustomerDocument>;
}

/**
 *
 */
const CustomerPill = ({ query, resource }: CustomerPillProps) => {
	const customer = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox
			onValueChange={({ value }) => {
				query.where('customer_id', toNumber(value));
			}}
		>
			<ComboboxTriggerPrimitive asChild>
				{customer ? (
					<ButtonPill
						size="xs"
						leftIcon="user"
						removable={true}
						onRemove={() => query.where('customer_id', null)}
					>
						<ButtonText>{format(customer)}</ButtonText>
					</ButtonPill>
				) : (
					<ButtonPill size="xs" leftIcon="user" variant="muted">
						<ButtonText>{t('Select Customer', { _tags: 'core' })}</ButtonText>
					</ButtonPill>
				)}
			</ComboboxTriggerPrimitive>
			<ComboboxContent>
				<CustomerSearch withGuest />
			</ComboboxContent>
		</Combobox>
	);
};

export default CustomerPill;
