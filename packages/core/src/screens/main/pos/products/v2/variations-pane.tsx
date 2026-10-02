import * as React from 'react';

import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';
import { of } from 'rxjs';

import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { type EngineRecord, useDocField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useT } from '../../../../../contexts/translations';
import { useCollectionBinding, useQueryState, useQueryStateActions } from '../../../../../query';
import { DataTable } from '../../../components/data-table/v2';
import { DataTableSkeleton } from '../../../components/data-table/v2/skeleton';
import { matchesStockStatusFilter } from '../../../components/product/stock-filter';
import { useVariationsRefresh } from '../cells/variations-popover/use-variations-refresh';
import { ProductsFooter } from './footer';
import { VariationName, VariationRow, VariationStock } from './rows/variation-row';
import { Price } from '../cells/price';
import { SKU } from '../cells/sku';
import { COGS } from '../cells/cogs';
import { ProductVariationImage } from '../../../components/product/variation-image';

type Props = { parent: EngineRecord<'products'>; stockStatus?: string };

// The footer's sync button already turns while the variations refresh. The list's own
// loading band would add and remove a strip under the rows on every drill-in.
function NoListFooter() {
	return null;
}

export function VariationsPane({ parent, ...props }: Props) {
	const state = useQueryState<'variations'>();
	const variationIds: number[] = useDocField(parent, (value) => value.payload.variations) ?? [];
	const remoteIds = variationIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	const binding = useCollectionBinding('variations', state, { remoteIds });
	// The popover's bounded, logged refresh retry: a first refresh that hangs or returns
	// nothing during a transient failure must not leave the default drill-in pane empty.
	useVariationsRefresh(binding);
	// The query answers within a frame of mounting, but not during the first render. Suspending
	// on it commits the fallback, and React holds a committed fallback for 300 ms before
	// revealing what replaces it: a third of a second of placeholder over rows that were ready
	// almost at once. So the first answer is awaited here, outside Suspense, where the swap is
	// immediate — and lands while the pane is still off-stage.
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- ObservableResource exposes a stable BehaviorSubject property, not an RxDB $-getter; exception dated 2026-10-01.
	const answered = useObservableEagerState(binding.resource.valueRef$$) !== undefined;
	// As many skeleton rows as the parent has variations: if the answer is slow, the rows that
	// replace them land in the same places and the pane does not reflow.
	const skeleton = <DataTableSkeleton id="pos-products" rowCount={variationIds.length || 1} />;
	if (!answered) return skeleton;
	return (
		<Suspense fallback={skeleton}>
			<VariationsTable parent={parent} binding={binding} {...props} />
		</Suspense>
	);
}

function VariationsTable({
	parent,
	binding,
	stockStatus,
}: Props & { binding: ReturnType<typeof useCollectionBinding<'variations'>> }) {
	const state = useQueryState<'variations'>();
	const actions = useQueryStateActions<'variations'>();
	const result = useObservableSuspense(binding.resource);
	// The source filters resident variations with the shared stock resolver, not a query filter.
	const hits = result.hits.filter((hit) =>
		matchesStockStatusFilter(hit.record.payload, stockStatus)
	);
	const name = useDocField(parent, (value) => value.payload.name);
	const parentCount = useDocField(parent, (value) => value.payload.variations?.length);
	// The parent is the denominator, floored at resident count; absent lists use the binding total.
	const total$ = React.useMemo(
		() => (parentCount === undefined ? binding.total$ : of(Math.max(parentCount, hits.length))),
		[parentCount, hits.length, binding.total$]
	);
	const t = useT();
	return (
		<DataTable<{ record: EngineRecord<'variations'> }>
			id="pos-products"
			persistSort={false}
			collectionName="variations"
			binding={binding}
			resource={binding.resource}
			tableConfig={{ data: hits }}
			sort={state.sort}
			actions={actions}
			active$={binding.active$}
			total$={binding.total$}
			sync={binding.sync}
			cells={{
				name: VariationName,
				price: Price,
				stock_quantity: VariationStock,
				sku: SKU,
				cost_of_goods_sold: COGS,
				image: ProductVariationImage,
				actions: () => null,
			}}
			// The rows travel with their pane; none of them animates on its own.
			renderItem={({ item }) => (
				<VirtualizedList.Item>
					<VariationRow item={item} parent={parent} />
				</VirtualizedList.Item>
			)}
			ListFooterComponent={NoListFooter}
			TableFooterComponent={(props) => (
				<ProductsFooter {...props} count={hits.length} total$={total$}>
					<Text className="text-muted-foreground text-sm" numberOfLines={1}>
						{t('pos_products.n_variations_of', { count: parentCount ?? hits.length, name })}
					</Text>
				</ProductsFooter>
			)}
		/>
	);
}
