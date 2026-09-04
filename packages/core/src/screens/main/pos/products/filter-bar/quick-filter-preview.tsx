import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { EngineRecord } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import { quickFilterToQueryPatch } from './apply-quick-filter';
import { getPOSProductSort } from '../pos-product-sort';
import { useUISettings } from '../../../contexts/ui-settings';
import { useT } from '../../../../../contexts/translations';
import {
	QueryStateProvider,
	useQueryState,
	useQueryStateActions,
	useRelationalCollectionBinding,
} from '../../../../../query';

import type { QuickFilter } from './filter-bar-layout';
import type { FiltersOf, QueryStateOf } from '../../../../../query/query-state-types';
import type { QueryBinding } from '../../../../../query/query-bindings';

const PREVIEW_LIMIT = 200;

function PreviewResults({ resource }: { resource: QueryBinding['resource'] }) {
	const result = useObservableSuspense(resource) as {
		hits: { id: string; record: EngineRecord<'products'> }[];
	};
	const t = useT();
	const count = result.hits.length;

	return (
		<VStack className="gap-1">
			<Text testID="quick-filter-preview-count" className="font-medium">
				{count >= PREVIEW_LIMIT
					? t('pos_products.quick_filter_preview_count_capped')
					: t('pos_products.quick_filter_preview_count', { n: count })}
			</Text>
			{count === 0 && (
				<Text testID="quick-filter-preview-empty" className="text-muted-foreground text-sm">
					{t('pos_products.quick_filter_preview_empty')}
				</Text>
			)}
			{result.hits.slice(0, 5).map(({ id, record }, index) => (
				<Text
					key={id}
					testID={`quick-filter-preview-item-${index}`}
					className="text-muted-foreground text-sm"
					decodeHtml
				>
					{record.payload.name ?? ''}
				</Text>
			))}
		</VStack>
	);
}

type ProductSort = QueryStateOf<'products'>['sort'];

function PreviewQuery({ draft, settingsSort }: { draft: QuickFilter; settingsSort: ProductSort }) {
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	// Build the binding above the boundary so a suspended reader retries the same resource (#1707).
	const binding = useRelationalCollectionBinding(state);
	const conditions = draft.conditions;
	const sort = draft.sort;

	React.useEffect(() => {
		// The draft is local React state while the preview query is an external store. Debouncing
		// keeps search and price typing from rebuilding the device query on every keystroke.
		const timer = setTimeout(() => {
			const patch = quickFilterToQueryPatch({
				id: draft.id,
				type: 'quick',
				label: '',
				conditions,
				...(sort ? { sort } : {}),
			});
			actions.resetFilters();
			for (const [field, value] of Object.entries(patch.filters)) {
				actions.setFilter(field as keyof FiltersOf<'products'>, value as never);
			}
			if (patch.search) actions.setSearch(patch.search);
			else actions.clearSearch();
			const nextSort = sort ?? settingsSort;
			actions.setSort(nextSort.field, nextSort.direction);
		}, 250);
		return () => clearTimeout(timer);
	}, [actions, conditions, draft.id, settingsSort, sort]);

	return (
		<Suspense>
			<PreviewResults resource={binding.resource} />
		</Suspense>
	);
}

/**
 * The preview runs against the SAME baseline the POS grid resets to when a quick filter is
 * pressed (`POSProducts`): published products, in-stock only unless the merchant shows
 * out-of-stock, and the settings sort when the button carries none. Anything else would
 * count products the button can never show.
 */
export function QuickFilterPreview({ draft }: { draft: QuickFilter }) {
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useDocField(uiSettings, (value) => value.showOutOfStock);
	const sortBy = useDocField(uiSettings, (value) => value.sortBy);
	const sortDirection = useDocField(uiSettings, (value) => value.sortDirection);
	const settingsSort = React.useMemo(
		() => getPOSProductSort(sortBy, sortDirection),
		[sortBy, sortDirection]
	);
	const initialFilters = {
		status: 'publish' as const,
		...(showOutOfStock ? {} : { stock_status: 'instock' as const }),
	};
	return (
		<ErrorBoundary>
			<QueryStateProvider
				collection="products"
				initialPageSize={PREVIEW_LIMIT}
				initialFilters={initialFilters}
				initialSort={draft.sort ?? settingsSort}
			>
				<PreviewQuery draft={draft} settingsSort={settingsSort} />
			</QueryStateProvider>
		</ErrorBoundary>
	);
}
