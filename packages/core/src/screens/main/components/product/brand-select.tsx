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
import type { EngineRecord } from '@wcpos/query';

import {
	useDrawnHandle,
	useGuardedExtension,
	useQuerySnapshot,
	useSearchSelect,
} from '../../../../query';

import type { SearchSelect } from '../../../../query';

/**
 *
 */
function BrandList({ select }: { select: SearchSelect }) {
	// Drawn, not live: a typed search's new handle answers while the previous options stay.
	const shown = useDrawnHandle(select.handle);
	const settling = shown !== select.handle;
	const snapshot = useQuerySnapshot(shown, ['pending', 'exhausted']);
	const result = snapshot as unknown as {
		hits: { id: string; record: EngineRecord<'brands'> }[];
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
			ListEmptyComponent={<ComboboxEmpty>{t('common.no_brand_found')}</ComboboxEmpty>}
		/>
	);
}

/**
 *
 */
export function BrandSearch() {
	const t = useT();
	const select = useSearchSelect('brand');

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_brands')}
				value={select.search}
				onChangeText={select.setSearch}
			/>
			<Suspense>
				<BrandList select={select} />
			</Suspense>
		</>
	);
}

/**
 *
 */
export function BrandSelect({
	onValueChange,
}: {
	onValueChange?: (option: import('@wcpos/components/combobox').Option | undefined) => void;
}) {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('common.select_brand')} />
			</ComboboxTrigger>
			<ComboboxContent className="min-w-64">
				<BrandSearch />
			</ComboboxContent>
		</Combobox>
	);
}
