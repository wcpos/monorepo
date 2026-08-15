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

import { useSearchSelect } from '../../../../query';

/**
 *
 */
function TagList({ resource }: { resource: ReturnType<typeof useSearchSelect>['resource'] }) {
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
			ListEmptyComponent={<ComboboxEmpty>{t('common.no_tag_found')}</ComboboxEmpty>}
		/>
	);
}

/**
 *
 */
export function TagSearch() {
	const t = useT();
	const binding = useSearchSelect('tag');

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_tags')}
				value={binding.search}
				onChangeText={binding.setSearch}
			/>
			<Suspense>
				<TagList resource={binding.resource} />
			</Suspense>
		</>
	);
}

/**
 *
 */
export function TagSelect({
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
				<ComboboxValue placeholder={t('common.select_tag')} />
			</ComboboxTrigger>
			<ComboboxContent className="min-w-64">
				<TagSearch />
			</ComboboxContent>
		</Combobox>
	);
}
