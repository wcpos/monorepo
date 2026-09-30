import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableSuspense } from 'observable-hooks';
import { decode } from 'html-entities';

import { Chip } from '@wcpos/components/chip';
import {
	TreeCombobox,
	TreeComboboxContent,
	TreeComboboxTrigger,
} from '@wcpos/components/tree-combobox';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import type { Option } from '@wcpos/components/combobox/types';

import { useT } from '../../../../../contexts/translations';
import { useEngineRecordsByWooId } from '../../../hooks/use-engine-document';
import { CategoryTreeLoader } from '../category-select';
import { useQueryState, useQueryStateActions } from '../../../../../query';

/**
 *
 */
export function CategoryPill() {
	const t = useT();
	const [options, setOptions] = React.useState<HierarchicalOption[]>([]);
	const activeCategoryIds = useQueryState<'products', number[]>(
		(state) => state.filters.categories
	);
	const actions = useQueryStateActions<'products'>();
	const selectedCategoriesResource = useEngineRecordsByWooId('categories', activeCategoryIds);
	const selected = React.useMemo<Option[]>(() => {
		if (!activeCategoryIds || activeCategoryIds.length === 0) return [];
		return activeCategoryIds.map((id) => {
			const opt = options.find((o) => o.value === String(id));
			return { value: String(id), label: opt?.label ?? t('common.loading') };
		});
	}, [activeCategoryIds, options, t]);

	const isActive = activeCategoryIds.length > 0;
	const records = useObservableSuspense(selectedCategoriesResource);
	const label = records.length
		? `${records[0].payload.name}${records.length > 1 ? ` +${records.length - 1}` : ''}`
		: t('common.category');

	const handleChange = React.useCallback(
		(newSelection: Option[]) => {
			actions.setFilter(
				'categories',
				newSelection.map((option) => toNumber(option.value))
			);
		},
		[actions]
	);

	const handleRemove = React.useCallback(() => {
		actions.clearFilter('categories');
	}, [actions]);

	return (
		<TreeCombobox options={options} multiple value={selected} onValueChange={handleChange}>
			<TreeComboboxTrigger asChild>
				<Chip
					icon="folder"
					on={isActive}
					testID="filter-pill-categories"
					clearTestID="filter-pill-remove-categories"
					onClear={isActive ? handleRemove : undefined}
					clearLabel={t('common.remove')}
					label={decode(label)}
				/>
			</TreeComboboxTrigger>
			<TreeComboboxContent
				searchPlaceholder={t('common.search_categories')}
				emptyMessage={t('common.no_category_found')}
			>
				<CategoryTreeLoader onOptionsLoaded={setOptions} />
			</TreeComboboxContent>
		</TreeCombobox>
	);
}
