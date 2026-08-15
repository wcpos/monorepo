import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	TreeCombobox,
	TreeComboboxContent,
	TreeComboboxTrigger,
} from '@wcpos/components/tree-combobox';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import type { Option } from '@wcpos/components/combobox/types';

import { useT } from '../../../../../contexts/translations';
import { useEngineDocumentsByWooId } from '../../../hooks/use-engine-document';
import { CategoryTreeLoader } from '../category-select';
import { useQueryState, useQueryStateActions } from '../../../../../query';

type ProductCategoryDocument = import('@wcpos/database').ProductCategoryDocument;

function CategoryPillLabel({
	resource,
	fallbackLabel,
}: {
	resource: ObservableResource<ProductCategoryDocument[]>;
	fallbackLabel: string;
}) {
	const selected = useObservableSuspense(resource);
	const displayText = React.useMemo(() => {
		if (selected.length === 0) return fallbackLabel;
		if (selected.length === 1) return selected[0].name;
		return `${selected[0].name} +${selected.length - 1}`;
	}, [fallbackLabel, selected]);

	return <ButtonText decodeHtml>{displayText}</ButtonText>;
}

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
	const selectedCategoriesResource = useEngineDocumentsByWooId<ProductCategoryDocument>(
		'products/categories',
		activeCategoryIds
	);
	const selected = React.useMemo<Option[]>(() => {
		if (!activeCategoryIds || activeCategoryIds.length === 0) return [];
		return activeCategoryIds.map((id) => {
			const opt = options.find((o) => o.value === String(id));
			return { value: String(id), label: opt?.label ?? t('common.loading') };
		});
	}, [activeCategoryIds, options, t]);

	const isActive = activeCategoryIds.length > 0;

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
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					removeTestID="filter-pill-remove-categories"
					onRemove={handleRemove}
				>
					<React.Suspense fallback={<ButtonText>{t('common.loading')}</ButtonText>}>
						<CategoryPillLabel
							resource={selectedCategoriesResource}
							fallbackLabel={t('common.category')}
						/>
					</React.Suspense>
				</ButtonPill>
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
