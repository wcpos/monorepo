import * as React from 'react';

import { EmptyState } from '@wcpos/components/empty-state';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { EngineRecord } from '@wcpos/query';
import { useDocField } from '@wcpos/query';
import type { FiltersOf, QueryStateOf } from '@wcpos/query/query-state';

import { quickFilterToQueryPatch } from './apply-quick-filter';
import { getPOSProductSort } from '../pos-product-sort';
import { useUISettings } from '../../../contexts/ui-settings';
import { useT } from '../../../../../contexts/translations';
import {
	QueryStateProvider,
	useDrawnHandle,
	useProductsQueryHandle,
	useQuerySnapshot,
	useQueryState,
	useQueryStateActions,
} from '../../../../../query';

import type { QuickFilter } from './filter-bar-layout';
import type { QueryHandle, SnapshotFields } from '../../../../../query';

const PREVIEW_LIMIT = 200;
// The preview draws the rows and nothing else: no spinner, no total, no paging.
const ANSWER_ONLY: SnapshotFields = [];

function PreviewResults({ handle }: { handle: QueryHandle }) {
	// The drawn handle: a changed draft keeps the previous matches on screen while it loads.
	const { result } = useQuerySnapshot(useDrawnHandle(handle), ANSWER_ONLY);
	const hits = result.hits as { id: string; record: EngineRecord<'products'> }[];
	const t = useT();
	const count = hits.length;

	return (
		<VStack className="gap-1">
			<Text testID="quick-filter-preview-count" className="font-medium">
				{count >= PREVIEW_LIMIT
					? t('pos_products.quick_filter_preview_count_capped')
					: t('pos_products.quick_filter_preview_count', { n: count })}
			</Text>
			{count === 0 && (
				<EmptyState
					testID="quick-filter-preview-empty"
					kind="empty"
					size="inline"
					title={t('pos_products.quick_filter_preview_empty')}
				/>
			)}
			{hits.slice(0, 5).map(({ id, record }, index) => (
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
	// The owner sits above the boundary: its retain must commit for the reader's answer (#1707).
	const handle = useProductsQueryHandle(state);
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
			<PreviewResults handle={handle} />
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
