import * as React from 'react';

import toNumber from 'lodash/toNumber';
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
	cashierID?: number;
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
	const query = useQuery<CustomerCollection>({
		queryKeys: ['customers', 'cashier-select'],
		collectionName: 'customers',
		initialParams: {
			sort: [{ last_name: 'asc' }],
			selector: {
				role: { $in: ['administrator', 'shop_manager', 'cashier'] },
			},
		},
		greedy: true,
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
export const CashierPill = ({ query, resource, cashierID }: CashierPillProps) => {
	let cashier = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();
	const t = useT();

	/**
	 * @FIXME - if the customers are cleared, it's possible that the cashier will be null
	 */
	if (!cashier && cashierID) {
		cashier = { id: cashierID };
	}

	/**
	 * value is always a string when dealing with comboboxes
	 *
	 * @NOTE - meta_data is used for _pos_user and _pos_store, so we need multipleElemMatch
	 */
	return (
		<Combobox
			onValueChange={({ value }) => {
				query
					.removeElemMatch('meta_data', { key: '_pos_user' }) // clear any previous value
					.where('meta_data')
					.multipleElemMatch({ key: '_pos_user', value: String(value) })
					.exec();
			}}
		>
			<ComboboxTriggerPrimitive asChild>
				<ButtonPill
					size="xs"
					leftIcon="userCrown"
					variant={cashier ? 'default' : 'muted'}
					removable={!!cashier}
					onRemove={() => query.removeElemMatch('meta_data', { key: '_pos_user' }).exec()}
				>
					<ButtonText>
						{cashier ? format(cashier) : t('Select Cashier', { _tags: 'core' })}
					</ButtonText>
				</ButtonPill>
			</ComboboxTriggerPrimitive>
			<ComboboxContent>
				<CashierSearch />
			</ComboboxContent>
		</Combobox>
	);
};
