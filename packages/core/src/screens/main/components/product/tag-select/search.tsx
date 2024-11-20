import * as React from 'react';

import { ComboboxSearch, ComboboxInput, ComboboxEmpty } from '@wcpos/components/src/combobox';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { TagList } from './list';
import { useT } from '../../../../../contexts/translations';

/**
 *
 */
export const TagSearch = () => {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['products/tags'],
		collectionName: 'products/tags',
		initialParams: {
			sort: [{ name: 'asc' }],
		},
		infiniteScroll: true,
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
				placeholder={t('Search Tags', { _tags: 'core' })}
				value={search}
				onValueChange={onSearch}
			/>
			<ComboboxEmpty>{t('No tag found', { _tags: 'core' })}</ComboboxEmpty>
			<Suspense>
				<TagList query={query} />
			</Suspense>
		</ComboboxSearch>
	);
};
