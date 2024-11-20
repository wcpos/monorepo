import * as React from 'react';

import { ComboboxSearch, ComboboxInput, ComboboxEmpty } from '@wcpos/components/src/combobox';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { CategoryList } from './list';
import { useT } from '../../../../../contexts/translations';

/**
 *
 */
export const CategorySearch = () => {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['products/categories'],
		collectionName: 'products/categories',
		initialParams: {
			sort: [{ name: 'asc' }],
		},
		greedy: true,
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
				placeholder={t('Search Categories', { _tags: 'core' })}
				value={search}
				onValueChange={onSearch}
			/>
			<ComboboxEmpty>{t('No category found', { _tags: 'core' })}</ComboboxEmpty>
			<Suspense>
				<CategoryList query={query} />
			</Suspense>
		</ComboboxSearch>
	);
};
