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
	type Option,
} from '@wcpos/components/combobox';
import { Suspense } from '@wcpos/components/suspense';
import { useT } from '@wcpos/core/contexts/translations';
import type { EngineRecord } from '@wcpos/query';

import {
	useDrawnHandle,
	useGuardedExtension,
	useQuerySnapshot,
	useSearchSelect,
} from '../../../../query';

import type { SearchSelect } from '../../../../query';

/** Taxonomies searched by name (categories are a tree); literal `t('…')` keys for the extractor. */
const WORDS: Record<'tag' | 'brand', (t: ReturnType<typeof useT>) => string[]> = {
	tag: (t) => [t('common.search_tags'), t('common.no_tag_found'), t('common.select_tag')],
	brand: (t) => [t('common.search_brands'), t('common.no_brand_found'), t('common.select_brand')],
};
type Collection = keyof typeof WORDS;

function CollectionList({ select, empty }: { select: SearchSelect; empty: string }) {
	// Drawn, not live: a typed search's new handle answers while the previous options stay.
	const shown = useDrawnHandle(select.handle);
	const settling = shown !== select.handle;
	const snapshot = useQuerySnapshot(shown, ['pending', 'exhausted']);
	const result = snapshot as unknown as {
		hits: { id: string; record: EngineRecord<'tags'> | EngineRecord<'brands'> }[];
	};
	const handleEndReached = useGuardedExtension(
		select.extendLimit,
		result.hits.length,
		select.limit,
		// The rows drawn may be the previous search's: a full old page must not page the new
		// search before its first page answers, so settling counts as pending.
		{ pending: snapshot.pending || settling, exhausted: snapshot.exhausted }
	);

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
			ListEmptyComponent={<ComboboxEmpty>{empty}</ComboboxEmpty>}
		/>
	);
}

/** A combobox's search box and the collection's matches, bound to the local search. */
export function CollectionSearch({ collection }: { collection: Collection }) {
	const [search, empty] = WORDS[collection](useT());
	const select = useSearchSelect(collection);

	return (
		<>
			<ComboboxInput placeholder={search} value={select.search} onChangeText={select.setSearch} />
			<Suspense>
				<CollectionList select={select} empty={empty} />
			</Suspense>
		</>
	);
}

/** Pick one term of the collection; the quick-filter editor adds it to its list. */
export function CollectionSelect({
	collection,
	onValueChange,
}: {
	collection: Collection;
	onValueChange?: (option: Option | undefined) => void;
}) {
	const pick = WORDS[collection](useT())[2];
	return (
		<Combobox onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={pick} />
			</ComboboxTrigger>
			<ComboboxContent className="min-w-64">
				<CollectionSearch collection={collection} />
			</ComboboxContent>
		</Combobox>
	);
}
