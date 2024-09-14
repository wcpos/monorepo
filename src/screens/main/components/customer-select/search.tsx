import * as React from 'react';

import { ComboboxSearch, ComboboxInput, ComboboxEmpty } from '@wcpos/components/src/combobox';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { CustomerList } from './list';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const CustomerSearch = () => {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 * Query for cashiers
	 */
	const query = useQuery({
		queryKeys: ['customers', 'customer-select'],
		collectionName: 'customers',
		initialParams: {
			sortBy: 'last_name',
			sortDirection: 'asc',
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
		<ComboboxSearch shouldFilter={false}>
			<ComboboxInput
				placeholder={t('Search Customers', { _tags: 'core' })}
				value={search}
				onValueChange={onSearch}
			/>
			<ComboboxEmpty>{t('No customers found', { _tags: 'core' })}</ComboboxEmpty>
			<Suspense>
				<CustomerList query={query} />
			</Suspense>
		</ComboboxSearch>
	);
};
