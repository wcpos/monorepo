import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import CustomerSelect from '../../../components/customer-select';
import useCustomerNameFormat from '../../../hooks/use-customer-name-format';

interface CashierPillProps {
	query: Query<CustomerCollection>;
	resource: ObservableResource<CustomerDocument>;
}

/**
 *
 */
export const CashierPill = ({ query, resource }: CashierPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const cashier = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();
	const t = useT();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(cashier) => {
			if (cashier && cashier.id) {
				query.where('meta_data', {
					$elemMatch: { key: '_pos_user', value: String(cashier.id) },
				});
			}
		},
		[query]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		query.where('meta_data', { $elemMatch: { key: '_pos_user', value: null } });
	}, [query]);

	/**
	 *
	 */
	if (cashier) {
		return (
			<Pill size="small" removable onRemove={handleRemove} icon="userCrown">
				{format(cashier)}
			</Pill>
		);
	}

	/**
	 *
	 */
	return openSelect ? (
		<CustomerSelect
			onBlur={() => setOpenSelect(false)}
			onSelectCustomer={handleSelect}
			autoFocus={true}
			size="small"
			style={{ minWidth: 200 }}
			initialParams={{
				selector: {
					role: { $in: ['administrator', 'shop_manager', 'cashier'] },
				},
			}}
			placeholder={t('Search Cashier', { _tags: 'core' })}
			queryKey="cashier-select"
			withGuest={false}
		/>
	) : (
		<Pill icon="userCrown" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select Cashier', { _tags: 'core' })}
		</Pill>
	);
};
