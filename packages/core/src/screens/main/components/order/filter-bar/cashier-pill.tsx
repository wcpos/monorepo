import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Combobox,
	ComboboxContent,
	ComboboxInput,
	ComboboxTrigger,
} from '@wcpos/components/combobox';
import { Suspense } from '@wcpos/components/suspense';
import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import { Query, useQuery } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../../contexts/translations';

const uiLogger = getLogger(['wcpos', 'ui', 'filter']);
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
		<>
			<ComboboxInput
				placeholder={t('Search Cashiers', { _tags: 'core' })}
				value={search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<CustomerList query={query} withGuest={false} />
			</Suspense>
		</>
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
				uiLogger.debug('value', value);
				query
					.removeElemMatch('meta_data', { key: '_pos_user' }) // clear any previous value
					.where('meta_data')
					.multipleElemMatch({ key: '_pos_user', value: String(value) })
					.exec();
			}}
		>
			<ComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="userCrown"
					variant={cashier ? undefined : 'muted'}
					removable={!!cashier}
					onRemove={() => query.removeElemMatch('meta_data', { key: '_pos_user' }).exec()}
				>
					<ButtonText>
						{cashier ? format(cashier) : t('Select Cashier', { _tags: 'core' })}
					</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<CashierSearch />
			</ComboboxContent>
		</Combobox>
	);
};
