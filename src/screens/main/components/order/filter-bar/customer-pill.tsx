import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';

import { useT } from '../../../../../contexts/translations';
import { CustomerSelect } from '../../../components/customer-select';
import useCustomerNameFormat from '../../../hooks/use-customer-name-format';

interface CustomerPillProps {
	query: Query<CustomerCollection>;
	resource: ObservableResource<CustomerDocument>;
}

/**
 *
 */
const CustomerPill = ({ query, resource }: CustomerPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const customer = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();
	const t = useT();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(customer) => {
			if (customer && customer.id) {
				query.where('customer_id', customer.id);
			}
		},
		[query]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		query.where('customer_id', null);
	}, [query]);

	/**
	 *
	 */
	if (customer) {
		return (
			<ButtonPill
				size="xs"
				leftIcon="user"
				removable={true}
				onRemove={() => query.where('customer_id', null)}
			>
				<ButtonText>{format(customer)}</ButtonText>
			</ButtonPill>
		);
	}

	/**
	 *
	 */
	return (
		<CustomerSelect onSelectCustomer={handleSelect}>
			<ButtonPill size="xs" leftIcon="user" variant="secondary">
				<ButtonText>{t('Select Customer', { _tags: 'core' })}</ButtonText>
			</ButtonPill>
		</CustomerSelect>
	);
};

export default CustomerPill;
