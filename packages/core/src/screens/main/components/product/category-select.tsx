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

import { useSearchSelect } from '../../../../query';

/**
 *
 */
function CategoryList({ resource }: { resource: ReturnType<typeof useSearchSelect>['resource'] }) {
	const result = useObservableSuspense(resource) as {
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
	const binding = useSearchSelect('category');

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_categories')}
				value={binding.search}
				onChangeText={binding.setSearch}
			/>
			<Suspense>
				<CategoryList resource={binding.resource} />
			</Suspense>
		</>
	);
}

/**
 * Loads categories via useQuery and passes them as HierarchicalOption[] to a callback.
 * Intended to be rendered inside TreeComboboxContent so it only mounts when the popover opens.
 *
 * @param onOptionsLoaded Must be a stable reference (e.g. setState) — an unstable
 *   callback will cause infinite re-renders via the useEffect dependency.
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
			result.hits
				.filter(({ document: doc }) => doc.id != null)
				.map(({ document: doc }) => ({
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
