import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { Query } from '@wcpos/query';

import { ProductTile } from './product-tile';
import { VariableProductTile } from './variable-product-tile';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { DataTableFooter } from '../../../components/data-table/footer';
import { TaxBasedOn } from '../../../components/product/tax-based-on';
import { useTaxRates } from '../../../contexts/tax-rates';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface ProductGridProps {
	query: Query<any>;
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

export function ProductGrid({ query }: ProductGridProps) {
	const { uiSettings } = useUISettings('pos-products');
	const gridColumns = useObservableEagerState(uiSettings.gridColumns$);
	const gridFields = useObservableEagerState(uiSettings.gridFields$) as GridFields;
	const { calcTaxes } = useTaxRates();
	const t = useT();

	const result = useObservableSuspense(query.resource);
	const deferredResult = React.useDeferredValue(result);

	/**
	 * Chunk flat product list into rows of N
	 */
	const rows = React.useMemo(() => {
		const products = deferredResult.hits.map((hit: { document: ProductDocument }) => hit.document);
		const chunked: ProductDocument[][] = [];
		for (let i = 0; i < products.length; i += gridColumns) {
			chunked.push(products.slice(i, i + gridColumns));
		}
		return chunked;
	}, [deferredResult.hits, gridColumns]);

	return (
		<View className="flex h-full flex-col">
			<VirtualizedList.Root style={{ flex: 1 }}>
				<VirtualizedList.List
					data={rows}
					renderItem={({ item: row }) => (
						<VirtualizedList.Item>
							<View className="flex-row">
								{row.map((product: ProductDocument) =>
									product.type === 'variable' ? (
										<VariableProductTile
											key={product.uuid}
											product={product}
											gridFields={gridFields}
										/>
									) : (
										<ProductTile key={product.uuid} product={product} gridFields={gridFields} />
									)
								)}
								{/* Spacers for incomplete last row */}
								{row.length < gridColumns &&
									Array.from({ length: gridColumns - row.length }).map((_, i) => (
										<View key={`spacer-${i}`} className="m-1 flex-1" />
									))}
							</View>
						</VirtualizedList.Item>
					)}
					estimatedItemSize={200}
					onEndReachedThreshold={0.1}
					onEndReached={() => {
						if (query.infiniteScroll) {
							query.loadMore();
						}
					}}
					ListEmptyComponent={() => (
						<View className="items-center justify-center p-4">
							<Text testID="no-data-message">{t('common.no_products_found')}</Text>
						</View>
					)}
				/>
			</VirtualizedList.Root>
			<View className="border-border border-t">
				{calcTaxes ? (
					<DataTableFooter query={query} count={deferredResult.hits.length}>
						<TaxBasedOn />
					</DataTableFooter>
				) : (
					<DataTableFooter query={query} count={deferredResult.hits.length} />
				)}
			</View>
		</View>
	);
}
