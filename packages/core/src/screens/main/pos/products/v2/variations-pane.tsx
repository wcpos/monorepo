import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';
import { of } from 'rxjs';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { EASE, PANE } from '@wcpos/components/lib/motion';
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

type Props = { parent: EngineRecord<'products'>; viewMode: string; stockStatus?: string };

export function VariationsPane({ parent, ...props }: Props) {
	const state = useQueryState<'variations'>();
	const variationIds: number[] = useDocField(parent, (value) => value.payload.variations) ?? [];
	const remoteIds = variationIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	const binding = useCollectionBinding('variations', state, { remoteIds });
	// The popover's bounded, logged refresh retry: a first refresh that hangs or returns
	// nothing during a transient failure must not leave the default drill-in pane empty.
	useVariationsRefresh(binding);
	return (
		<Suspense fallback={<DataTableSkeleton id="pos-products" />}>
			<VariationsTable parent={parent} binding={binding} {...props} />
		</Suspense>
	);
}

function VariationsTable({
	parent,
	binding,
	viewMode,
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
			renderItem={({ item, index }) => (
				<VirtualizedList.Item>
					<Animated.View
						entering={
							viewMode === 'grid'
								? FadeIn.delay(index * 22)
										.duration(PANE)
										.easing(EASE)
										.reduceMotion(ReduceMotion.System)
								: undefined
						}
					>
						<VariationRow item={item} parent={parent} />
					</Animated.View>
				</VirtualizedList.Item>
			)}
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
