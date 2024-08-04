import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';

import { useT } from '../../../../../contexts/translations';
import { CustomerSelect } from '../../../components/customer-select';
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
	if (cashier) {
		return (
			<ButtonPill
				size="xs"
				leftIcon="userCrown"
				removable={true}
				onRemove={() => query.where('meta_data', { $elemMatch: { key: '_pos_user', value: null } })}
			>
				<ButtonText>{format(cashier)}</ButtonText>
			</ButtonPill>
		);
	}

	/**
	 *
	 */
	return (
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
		>
			<ButtonPill size="xs" leftIcon="userCrown">
				<ButtonText>{t('Select Cashier', { _tags: 'core' })}</ButtonText>
			</ButtonPill>
		</CustomerSelect>
	);
};
