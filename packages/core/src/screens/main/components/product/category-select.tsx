import * as React from 'react';

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
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';

/**
 *
 */
function CategoryList({ query }: { query: ReturnType<typeof useQuery> }) {
	const result = useObservableSuspense(query!.resource) as {
		hits: { id: string; document: { id?: number; name?: string } }[];
	};
	const t = useT();

	const data = result.hits.map(
		({ id, document }: { id: string; document: { id?: number; name?: string } }) => ({
			value: String(document.id),
			label: document.name ?? '',
		})
	);

	return (
		<ComboboxList
			data={data}
			onEndReached={() => {
				if (query?.infiniteScroll) {
					query.loadMore();
				}
			}}
			renderItem={({ item }) => (
				<ComboboxItem value={String(item.value)} label={item.label} item={item}>
					<ComboboxItemText />
				</ComboboxItem>
			)}
			estimatedItemSize={44}
			ListEmptyComponent={<ComboboxEmpty>{t('common.no_category_found')}</ComboboxEmpty>}
		/>
	);
}

/**
 *
 */
export function CategorySearch() {
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
			query?.debouncedSearch(value);
		},
		[query]
	);

	/**
	 * Clear the search when unmounting
	 */
	React.useEffect(() => {
		return () => query?.search('');
	}, [query]);

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_categories')}
				value={search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<CategoryList query={query} />
			</Suspense>
		</>
	);
}

/**
 * Loads categories via useQuery and passes them as HierarchicalOption[] to a callback.
 * Intended to be rendered inside TreeComboboxContent so it only mounts when the popover opens.
 */
function CategoryTreeLoaderInner({
	onOptionsLoaded,
}: {
	onOptionsLoaded: (options: HierarchicalOption[]) => void;
}) {
	const categoryQuery = useQuery({
		queryKeys: ['products/categories'],
		collectionName: 'products/categories',
		initialParams: {
			sort: [{ name: 'asc' }],
		},
		greedy: true,
	});

	const result = useObservableSuspense(categoryQuery!.resource) as {
		hits: { id: string; document: { id?: number; name?: string; parent?: number } }[];
	};

	const options = React.useMemo<HierarchicalOption[]>(
		() =>
			result.hits.map(({ document: doc }) => ({
				value: String(doc.id),
				label: doc.name ?? '',
				parentId: doc.parent && doc.parent > 0 ? String(doc.parent) : undefined,
			})),
		[result.hits]
	);

	React.useEffect(() => {
		onOptionsLoaded(options);
	}, [options, onOptionsLoaded]);

	return null;
}

export function CategoryTreeLoader(props: {
	onOptionsLoaded: (options: HierarchicalOption[]) => void;
}) {
	return (
		<Suspense>
			<CategoryTreeLoaderInner {...props} />
		</Suspense>
	);
}

/**
 *
 */
export function CategorySelect({
	value,
	onValueChange,
}: {
	value?: import('@wcpos/components/combobox').Option;
	onValueChange?: (option: import('@wcpos/components/combobox').Option | undefined) => void;
}) {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox value={value} onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('common.select_category')} />
			</ComboboxTrigger>
			<ComboboxContent className="min-w-64">
				<CategorySearch />
			</ComboboxContent>
		</Combobox>
	);
}
