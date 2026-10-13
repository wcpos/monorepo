import * as React from 'react';

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

import {
	useAllCategoriesHandle,
	useDrawnHandle,
	useGuardedExtension,
	useQuerySnapshot,
	useSearchSelect,
} from '../../../../query';

import type { QueryHandle, SearchSelect } from '../../../../query';

/**
 *
 */
function CategoryList({ select }: { select: SearchSelect }) {
	// Drawn, not live: a typed search's new handle answers while the previous options stay.
	const shown = useDrawnHandle(select.handle);
	const settling = shown !== select.handle;
	const snapshot = useQuerySnapshot(shown, ['pending', 'exhausted']);
	const result = snapshot as unknown as {
		hits: { id: string; record: EngineRecord<'categories'> }[];
	};
	const handleEndReached = useGuardedExtension(
		select.extendLimit,
		result.hits.length,
		select.limit,
		// The rows drawn may be the previous search's: a full old page must not page the new
		// search before its first page answers, so settling counts as pending.
		{ pending: snapshot.pending || settling, exhausted: snapshot.exhausted }
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
	const select = useSearchSelect('category');

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_categories')}
				value={select.search}
				onChangeText={select.setSearch}
			/>
			<Suspense>
				<CategoryList select={select} />
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
	handle,
}: {
	onOptionsLoaded: (options: HierarchicalOption[]) => void;
	handle: QueryHandle;
}) {
	const result = useQuerySnapshot(handle, []) as unknown as {
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
	// The handle's owner is HERE, above the boundary, and only the reader is inside it. The
	// owner's retain is an effect, and it is what starts the read: an owner inside the boundary
	// its reader suspends is discarded with the aborted render and never commits, so the read
	// never starts and the reader waits forever (#1707). Above it, this component commits
	// alongside the fallback, the read starts, and the retry reads the same handle's answer.
	const handle = useAllCategoriesHandle();

	return (
		<Suspense>
			<CategoryTreeLoaderInner {...props} handle={handle} />
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
