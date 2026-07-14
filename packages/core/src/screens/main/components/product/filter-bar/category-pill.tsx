import * as React from 'react';

import toNumber from 'lodash/toNumber';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	TreeCombobox,
	TreeComboboxContent,
	TreeComboboxTrigger,
} from '@wcpos/components/tree-combobox';
import { Query } from '@wcpos/query';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import type { Option } from '@wcpos/components/combobox/types';

import { useT } from '../../../../../contexts/translations';
import { useEngineDocumentsByWooId } from '../../../hooks/use-engine-document';
import { CategoryTreeLoader } from '../category-select';

type ProductCollection = import('@wcpos/database').ProductCollection;
type ProductCategoryDocument = import('@wcpos/database').ProductCategoryDocument;

interface Props {
	query: Query<ProductCollection>;
}

/**
 * Extract category IDs from the query selector, handling both formats:
 * - Direct: selector.categories.$elemMatch.id (single from ProductCategories)
 * - $and/$or: selector.$and[].{$or[].categories.$elemMatch.id} (multi from CategoryPill)
 */
function getCategoryIdsFromQuery(query: Query<ProductCollection>): number[] {
	const directId = query.getElemMatchId('categories');
	if (directId !== undefined) {
		return [directId];
	}

	const selector = query.currentRxQuery?.mangoQuery?.selector as Record<string, any> | undefined;
	if (selector?.$and) {
		for (const condition of selector.$and) {
			if (Array.isArray(condition.$or)) {
				const ids: number[] = [];
				for (const clause of condition.$or) {
					const id = clause?.categories?.$elemMatch?.id;
					if (id !== undefined) ids.push(id);
				}
				if (ids.length > 0) return ids;
			}
		}
	}

	return [];
}

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
export function CategoryPill({ query }: Props) {
	const t = useT();
	const [options, setOptions] = React.useState<HierarchicalOption[]>([]);

	const activeCategoryIds$ = React.useMemo(
		() =>
			query.rxQuery$.pipe(
				map(() => getCategoryIdsFromQuery(query)),
				distinctUntilChanged((a, b) => a.length === b.length && a.every((v, i) => v === b[i]))
			),
		[query]
	);
	const activeCategoryIds = useObservableEagerState(activeCategoryIds$);
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
			if (newSelection.length > 0) {
				const orConditions = newSelection.map((opt) => ({
					categories: { $elemMatch: { id: toNumber(opt.value) } },
				}));
				query
					.removeWhere('categories')
					.and([{ $or: orConditions }])
					.exec();
			} else {
				query.removeWhere('categories').exec();
			}
		},
		[query]
	);

	const handleRemove = React.useCallback(() => {
		query.removeWhere('categories').exec();
	}, [query]);

	return (
		<TreeCombobox options={options} multiple value={selected} onValueChange={handleChange}>
			<TreeComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
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
