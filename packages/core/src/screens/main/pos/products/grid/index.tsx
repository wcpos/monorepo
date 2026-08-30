import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { EngineRecord } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { useDocField } from '@wcpos/query';

import { useGuardedExtendLimit } from '../../../../../query';
import { ProductGridFooter } from './grid-footer';
import { ProductTile } from './product-tile';
import { VariableProductTile } from './variable-product-tile';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { DataTableFooter } from '../../../components/data-table/footer';
import { TaxBasedOn } from '../../../components/product/tax-based-on';
import { useTaxSettings } from '../../../contexts/tax-rates';

import type { QueryStateActions } from '../../../../../query';

const gridLogger = getLogger(['wcpos', 'pos', 'products', 'grid']);

type ProductHit = {
	record: EngineRecord<'products'>;
};

interface ProductGridProps {
	binding: ReturnType<typeof import('../../../../../query').useRelationalCollectionBinding>;
	actions: Pick<QueryStateActions<'products'>, 'extendLimit'>;
}

interface GridFields {
	name: boolean;
	price: boolean;
	tax: boolean;
	on_sale: boolean;
	category: boolean;
	sku: boolean;
	barcode: boolean;
	stock_quantity: boolean;
	cost_of_goods_sold: boolean;
}

export function ProductGrid({ binding, actions }: ProductGridProps) {
	const { uiSettings } = useUISettings('pos-products');
	const gridColumns = useDocField(uiSettings, (value) => value.gridColumns);
	const gridFields = useDocField(uiSettings, (value) => value.gridFields) as GridFields;
	const { calcTaxes } = useTaxSettings();
	const t = useT();

	const result = useObservableSuspense(binding.resource);
	const deferredResult = React.useDeferredValue(result);

	// Guarded (#1221): search paging follows the engine's exhaustion verdict, not the shorter
	// locally merged product rows, while pending demand still blocks duplicate extensions.
	const handleEndReached = useGuardedExtendLimit(
		actions.extendLimit,
		deferredResult.hits.length,
		binding
	);

	/**
	 * Chunk flat product list into rows of N
	 */
	const { rows, skippedStaleHits } = React.useMemo(() => {
		const products = deferredResult.hits.reduce<ProductHit[]>((acc, hit) => {
			try {
				// Replication can briefly leave deferred hits pointing at stale RxDB docs.
				// Skip those entries so the grid keeps rendering while sync catches up.
				if (!hit.record) return acc;
				void hit.record.payload.name;
				acc.push(hit as ProductHit);
			} catch {
				// Counted below — every hit that fails to land in `products` was skipped.
			}
			return acc;
		}, []);
		const chunked: ProductHit[][] = [];
		for (let i = 0; i < products.length; i += gridColumns) {
			chunked.push(products.slice(i, i + gridColumns));
		}
		return { rows: chunked, skippedStaleHits: deferredResult.hits.length - products.length };
	}, [deferredResult.hits, gridColumns]);

	// Products vanishing from the grid during sync churn must be visible in the log
	// pipeline (cashier-full-information ruling), even though the grid self-heals
	// once sync catches up. One line per change, not per skipped hit.
	React.useEffect(() => {
		if (skippedStaleHits > 0) {
			gridLogger.warn('Products grid skipped stale rows while sync catches up', {
				context: { skipped: skippedStaleHits },
			});
		}
	}, [deferredResult.hits, skippedStaleHits]);

	return (
		<View className="flex h-full flex-col">
			<VirtualizedList.Root testID="pos-products-grid-scroller" style={{ flex: 1 }}>
				<VirtualizedList.List
					data={rows}
					renderItem={({ item: row }) => (
						<VirtualizedList.Item>
							<View className="flex-row">
								{row?.map(({ record }) =>
									record.payload.type === 'variable' ? (
										<VariableProductTile
											key={record.uuid}
											record={record}
											gridFields={gridFields}
										/>
									) : (
										<ProductTile key={record.uuid} record={record} gridFields={gridFields} />
									)
								)}
								{/* Spacers for incomplete last row */}
								{row &&
									row.length < gridColumns &&
									Array.from({ length: gridColumns - row.length }).map((_, i) => (
										<View key={`spacer-${i}`} className="m-1 flex-1" />
									))}
							</View>
						</VirtualizedList.Item>
					)}
					estimatedItemSize={200}
					onEndReachedThreshold={0.1}
					onEndReached={handleEndReached}
					ListFooterComponent={
						<ProductGridFooter binding={binding} count={deferredResult.hits.length} />
					}
					ListEmptyComponent={() => (
						<View className="items-center justify-center p-4">
							<Text testID="no-data-message">{t('common.no_products_found')}</Text>
						</View>
					)}
				/>
			</VirtualizedList.Root>
			<View className="border-border border-t">
				{calcTaxes ? (
					<DataTableFooter
						collectionName="products"
						active$={binding.active$}
						total$={binding.total$}
						sync={binding.sync}
						count={deferredResult.hits.length}
					>
						<TaxBasedOn />
					</DataTableFooter>
				) : (
					<DataTableFooter
						collectionName="products"
						active$={binding.active$}
						total$={binding.total$}
						sync={binding.sync}
						count={deferredResult.hits.length}
					/>
				)}
			</View>
		</View>
	);
}
