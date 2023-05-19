import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../lib/translations';
import CustomerSelect from '../../components/customer-select';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

interface CustomerPillProps {
	selectedCustomerResource: ObservableResource<any>;
	setQuery: any;
}

/**
 *
 */
const CustomerPill = ({ selectedCustomerResource, setQuery }: CustomerPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const customer = useObservableSuspense(selectedCustomerResource);
	const { format } = useCustomerNameFormat();

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		setQuery('selector.customer_id', null);
	}, [setQuery]);

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
		<CustomerSelect onBlur={() => setOpenSelect(false)} />
	) : (
		<Pill icon="user" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select Customer', { _tags: 'core' })}
		</Pill>
	);
};

export default CustomerPill;
