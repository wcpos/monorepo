import React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/combobox';
import { Suspense } from '@wcpos/components/suspense';
import { useT } from '@wcpos/core/contexts/translations';
import { useQuery } from '@wcpos/query';

/**
 *
 */
function BrandList({ query }) {
	const result = useObservableSuspense(query.resource);
	const t = useT();

	const data = result.hits.map(({ id, document }) => ({
		value: String(document.id),
		label: document.name,
	}));

	return (
		<ComboboxList
			data={data}
			onEndReached={() => {
				if (query?.infiniteScroll) {
					query.loadMore();
				}
			}}
			renderItem={({ item }) => (
				<ComboboxItem value={item.value} label={item.label}>
					<ComboboxItemText>{item.label}</ComboboxItemText>
				</ComboboxItem>
			)}
			estimatedItemSize={44}
			ListEmptyComponent={<ComboboxEmpty>{t('No brand found', { _tags: 'core' })}</ComboboxEmpty>}
		/>
	);
}

/**
 *
 */
export function BrandSearch() {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['products/brands'],
		collectionName: 'products/brands',
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
		<>
			<ComboboxInput
				placeholder={t('Search Brands', { _tags: 'core' })}
				value={search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<BrandList query={query} />
			</Suspense>
		</>
	);
}

/**
 *
 */
export function BrandSelect({ onValueChange }) {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('Select Brand', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent className="min-w-64">
				<BrandSearch />
			</ComboboxContent>
		</Combobox>
	);
}
