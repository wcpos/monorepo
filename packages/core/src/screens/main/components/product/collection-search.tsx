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

/** The product taxonomies searched by name; categories are a tree (`CategoryTreeLoader`). */
type Collection = 'tag' | 'brand';

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
	const t = useT();
	const select = useSearchSelect(collection);

	return (
		<>
			<ComboboxInput
				placeholder={t(`common.search_${collection}s`)}
				value={select.search}
				onChangeText={select.setSearch}
			/>
			<Suspense>
				<CollectionList select={select} empty={t(`common.no_${collection}_found`)} />
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
	const t = useT();
	return (
		<Combobox onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t(`common.select_${collection}`)} />
			</ComboboxTrigger>
			<ComboboxContent className="min-w-64">
				<CollectionSearch collection={collection} />
			</ComboboxContent>
		</Combobox>
	);
}
