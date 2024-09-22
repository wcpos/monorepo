import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Combobox,
	ComboboxTriggerPrimitive,
	ComboboxSearch,
	ComboboxInput,
	ComboboxEmpty,
	ComboboxContent,
} from '@wcpos/components/src/combobox';
import { Suspense } from '@wcpos/components/src/suspense';
import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import { useQuery, Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import useCustomerNameFormat from '../../../hooks/use-customer-name-format';
import { CustomerList } from '../../customer-select';

interface CashierPillProps {
	query: Query<CustomerCollection>;
	resource: ObservableResource<CustomerDocument>;
}

/**
 * Cashier Search
 */
const CashierSearch = () => {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 * Query for cashiers
	 */
	const query = useQuery({
		queryKeys: ['customers', 'cashier-select'],
		collectionName: 'customers',
		initialParams: {
			sortBy: 'last_name',
			sortDirection: 'asc',
			selector: {
				role: { $in: ['administrator', 'shop_manager', 'cashier'] },
			},
		},
	});

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(value: string) => {
			setSearch(value);
			query.debouncedSearch(value);
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<ComboboxSearch shouldFilter={false} className="min-w-64">
			<ComboboxInput
				placeholder={t('Search Cashiers', { _tags: 'core' })}
				value={search}
				onValueChange={onSearch}
			/>
			<ComboboxEmpty>{t('No cashiers found', { _tags: 'core' })}</ComboboxEmpty>
			<Suspense>
				<CustomerList query={query} />
			</Suspense>
		</ComboboxSearch>
	);
};

/**
 *
 */
export const CashierPill = ({ query, resource }: CashierPillProps) => {
	const cashier = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();
	const t = useT();

	/**
	 * value is always a string when dealing with comboboxes
	 */
	return (
		<Combobox
			onValueChange={({ value }) => {
				query.where('meta_data', {
					$elemMatch: { key: '_pos_user', value },
				});
			}}
		>
			<ComboboxTriggerPrimitive asChild>
				{cashier ? (
					<ButtonPill
						size="xs"
						leftIcon="userCrown"
						removable={true}
						onRemove={() =>
							query.where('meta_data', { $elemMatch: { key: '_pos_user', value: null } })
						}
					>
						<ButtonText>{format(cashier)}</ButtonText>
					</ButtonPill>
				) : (
					<ButtonPill size="xs" leftIcon="userCrown" variant="muted">
						<ButtonText>{t('Select Cashier', { _tags: 'core' })}</ButtonText>
					</ButtonPill>
				)}
			</ComboboxTriggerPrimitive>
			<ComboboxContent>
				<CashierSearch />
			</ComboboxContent>
		</Combobox>
	);
};
