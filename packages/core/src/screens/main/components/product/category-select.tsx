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
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import type { EngineRecord } from '@wcpos/query';

import { useAllCategoriesBinding, useGuardedExtension, useSearchSelect } from '../../../../query';

import type { SearchSelectBinding } from '../../../../query';

/**
 *
 */
function CategoryList({ binding }: { binding: SearchSelectBinding }) {
	const result = useObservableSuspense(binding.resource) as {
		hits: { id: string; record: EngineRecord<'categories'> }[];
	};
	const handleEndReached = useGuardedExtension(
		binding.extendLimit,
		result.hits.length,
		binding.limit
	);
	const t = useT();

	const data = result.hits.map(({ record }) => ({
		value: String(record.payload.id),
		label: record.payload.name ?? '',
	}));

	return (
		<ComboboxList
			data={data}
			renderItem={({ item }) => (
				<ComboboxItem value={String(item.value)} label={item.label} item={item}>
					<ComboboxItemText />
				</ComboboxItem>
			)}
			estimatedItemSize={44}
			onEndReached={handleEndReached}
			onEndReachedThreshold={0.1}
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
				<CategoryList binding={binding} />
			</Suspense>
		</>
	);
}

/**
 * Loads all resident categories and passes them as HierarchicalOption[] to a callback.
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
	const binding = useAllCategoriesBinding();

	const result = useObservableSuspense(binding.resource) as {
		hits: { id: string; record: EngineRecord<'categories'> }[];
	};

	const options = React.useMemo<HierarchicalOption[]>(
		() =>
			result.hits
				.filter(({ record }) => record.payload.id != null)
				.map(({ record }) => ({
					value: String(record.payload.id),
					label: record.payload.name ?? '',
					parentId:
						record.payload.parent && record.payload.parent > 0
							? String(record.payload.parent)
							: undefined,
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
