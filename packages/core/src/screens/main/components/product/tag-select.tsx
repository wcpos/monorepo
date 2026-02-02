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
const TagList = ({ query }) => {
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
			ListEmptyComponent={<ComboboxEmpty>{t('No tag found')}</ComboboxEmpty>}
		/>
	);
};

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
				placeholder={t('Search Tags')}
				value={search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<TagList query={query} />
			</Suspense>
		</>
	);
};

/**
 *
 */
export const TagSelect = ({ onValueChange }) => {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('Select Tag')} />
			</ComboboxTrigger>
			<ComboboxContent className="min-w-64">
				<TagSearch />
			</ComboboxContent>
		</Combobox>
	);
};
