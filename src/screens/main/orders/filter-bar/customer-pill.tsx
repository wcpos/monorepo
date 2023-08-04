import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../lib/translations';
import CustomerSelect from '../../components/customer-select';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

interface CustomerPillProps {
	query: any;
	resource: ObservableResource<import('@wcpos/database').CustomerDocument>;
}

/**
 *
 */
const CustomerPill = ({ query, resource }: CustomerPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const customer = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(customer) => {
			query.where('customer_id', customer.id);
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
			<Pill size="small" key="category" removable onRemove={handleRemove} icon="user">
				{format(customer)}
			</Pill>
		);
	}

	/**
	 *
	 */
	return openSelect ? (
		<CustomerSelect onBlur={() => setOpenSelect(false)} onSelectCustomer={handleSelect} />
	) : (
		<Pill icon="user" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select Customer', { _tags: 'core' })}
		</Pill>
	);
};

export default CustomerPill;
