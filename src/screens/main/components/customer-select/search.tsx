import * as React from 'react';

import { ComboboxSearch, ComboboxInput, ComboboxEmpty } from '@wcpos/components/src/combobox';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { CustomerList } from './list';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const CustomerSearch = ({ withGuest = false }: { withGuest?: boolean }) => {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 * Query for cashiers
	 */
	const query = useQuery({
		queryKeys: ['customers', 'customer-select'],
		collectionName: 'customers',
		initialParams: {
			sort: [{ last_name: 'asc' }],
		},
		infiniteScroll: true,
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
	 * Clear the search when unmounting
	 */
	React.useEffect(() => {
		return () => query.search('');
	}, [query]);

	/**
	 *
	 */
	return (
		<ComboboxSearch shouldFilter={false} className="min-w-64">
			<ComboboxInput
				placeholder={t('Search Customers', { _tags: 'core' })}
				value={search}
				onValueChange={onSearch}
			/>
			<ComboboxEmpty>{t('No customers found', { _tags: 'core' })}</ComboboxEmpty>
			<Suspense>
				<CustomerList query={query} withGuest={withGuest} />
			</Suspense>
		</ComboboxSearch>
	);
};
