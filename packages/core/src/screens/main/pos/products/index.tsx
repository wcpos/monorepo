import React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import omit from 'lodash/omit';
import { useObservableEagerState, useObservableRef } from 'observable-hooks';
import { type ExpandedState, getExpandedRowModel, type Row } from '@tanstack/react-table';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';
import { useRelationalQuery } from '@wcpos/query';

import { Actions } from './cells/actions';
import { Name } from './cells/name';
import { Price } from './cells/price';
import { SKU } from './cells/sku';
import { StockQuantity } from './cells/stock-quantity';
import { VariableActions } from './cells/variable-actions';
import { ProductVariationActions } from './cells/variation-actions';
import { ProductVariationName } from './cells/variation-name';
import { UISettingsForm } from './ui-settings-form';
import { useBarcode } from './use-barcode';
import { useT } from '../../../../contexts/translations';
import { DataTable, DataTableFooter, defaultRenderItem } from '../../components/data-table';
import FilterBar from '../../components/product/filter-bar';
import { ProductImage } from '../../components/product/image';
import { TaxBasedOn } from '../../components/product/tax-based-on';
import { VariableProductImage } from '../../components/product/variable-image';
import { VariableProductPrice } from '../../components/product/variable-price';
import { VariableProductRow } from '../../components/product/variable-product-row';
import { ProductVariationImage } from '../../components/product/variation-image';
import { QuerySearchInput } from '../../components/query-search-input';
import { UISettingsDialog } from '../../components/ui-settings';
import { useTaxRates } from '../../contexts/tax-rates';
import { useUISettings } from '../../contexts/ui-settings';
import { TextCell } from '../../components/text-cell';
import { COGS } from './cells/cogs';

type ProductDocument = import('@wcpos/database').ProductDocument;

const cells = {
	simple: {
		actions: Actions,
		image: ProductImage,
		name: Name,
		price: Price,
		sku: SKU,
		stock_quantity: StockQuantity,
		cost_of_goods_sold: COGS,
	},
	variable: {
		actions: VariableActions,
		image: VariableProductImage,
		name: Name,
		price: VariableProductPrice,
		stock_quantity: StockQuantity,
		sku: SKU,
		cost_of_goods_sold: COGS,
	},
};

const variationCells = {
	actions: ProductVariationActions,
	image: ProductVariationImage,
	name: ProductVariationName,
	stock_quantity: StockQuantity,
	price: Price,
	sku: SKU,
	cost_of_goods_sold: COGS,
};

/**
 *
 */
function renderCell(columnKey: string, info: any) {
	let type = 'simple';
	if (info.row.original.document.type === 'variable') {
		type = 'variable';
	}
	const Renderer = get(cells, [type, columnKey]);
	if (Renderer) {
		return <Renderer {...info} />;
	}

	return <TextCell {...info} />;
}

/**
 *
 */
function variationRenderCell({ column }: { column: { id: string } }) {
	return get(variationCells, column.id);
}

/**
 *
 */
function renderItem({
	item,
	index,
	table,
}: {
	item: Row<{ document: ProductDocument }>;
	index: number;
	table: import('@tanstack/react-table').Table<{ document: ProductDocument }>;
}) {
	if (item.original.document.type === 'variable') {
		return <VariableProductRow item={item} index={index} table={table} />;
	}
	return defaultRenderItem({ item, index, table });
}

/**
 *
 */
const TableFooter = (props: React.ComponentProps<typeof DataTableFooter>) => {
	return (
		<DataTableFooter {...props}>
			<TaxBasedOn />
		</DataTableFooter>
	);
};

/**
 *
 */
export const POSProducts = ({ isColumn = false }) => {
	const { uiSettings } = useUISettings('pos-products');
	const { calcTaxes } = useTaxRates();
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);
	const querySearchInputRef = React.useRef<React.ElementRef<typeof QuerySearchInput>>(null);
	const [expandedRef, expanded$] = useObservableRef<ExpandedState>({} as ExpandedState);
	const t = useT();

	/**
	 *
	 */
	const { parentQuery: query } = useRelationalQuery(
		{
			queryKeys: ['products', { target: 'pos', type: 'relational' }],
			collectionName: 'products',
			initialParams: {
				sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection as 'asc' | 'desc' }],
			},
			infiniteScroll: true,
		},
		{
			queryKeys: ['variations', { target: 'pos', type: 'relational' }],
			collectionName: 'variations',
			initialParams: {
				sort: [{ id: uiSettings.sortDirection as 'asc' | 'desc' }],
			},
			endpoint: 'products/variations',
			greedy: true,
		}
	);

	/**
	 * Barcode
	 */
	const { onKeyPress } = useBarcode(
		query as unknown as import('@wcpos/query').RelationalQuery<
			import('@wcpos/database').ProductCollection
		>,
		querySearchInputRef as never
	);

	/**
	 *
	 */
	React.useEffect(() => {
		if (showOutOfStock) {
			query?.removeWhere('stock_status').exec();
		} else {
			query?.where('stock_status').equals('instock').exec();
		}
	}, [query, showOutOfStock]);

	/**
	 * Helper to set expanded state directly, bypassing TanStack's updater function
	 * which has a minification bug with computed property destructuring.
	 * Uses lodash/omit which doesn't have this issue.
	 */
	/* eslint-disable react-compiler/react-compiler -- expandedRef is a mutable ref from useObservableRef */
	const setRowExpanded = React.useCallback(
		(rowId: string, expanded: boolean) => {
			const current = expandedRef.current as Record<string, boolean>;
			if (expanded) {
				expandedRef.current = { ...current, [rowId]: true };
			} else {
				expandedRef.current = omit(current, rowId);
			}
		},
		[expandedRef]
	);

	/**
	 * Table config
	 */
	const tableConfig = React.useMemo(
		() => ({
			getExpandedRowModel: getExpandedRowModel(),
			onExpandedChange: (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
				const value = typeof updater === 'function' ? updater(expandedRef.current) : updater;
				expandedRef.current = value;
			},
			getRowCanExpand: (row: Row<{ document: ProductDocument }>) =>
				row.original.document.type === 'variable',
			meta: {
				expandedRef,
				expanded$,
				setRowExpanded,
				variationRenderCell,
			},
		}),
		[expandedRef, expanded$, setRowExpanded]
	);
	/* eslint-enable react-compiler/react-compiler */

	/**
	 *
	 */
	return (
		<View className={`h-full p-2 ${isColumn && 'pr-0'}`}>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<ErrorBoundary>
						<VStack>
							<HStack>
								<ErrorBoundary>
									<QuerySearchInput
										ref={querySearchInputRef}
										query={query!}
										placeholder={t('common.search_products')}
										className="flex-1"
										onKeyPress={onKeyPress}
										testID="search-products"
									/>
								</ErrorBoundary>
								<UISettingsDialog title={t('common.product_settings')}>
									<UISettingsForm />
								</UISettingsDialog>
							</HStack>
							<ErrorBoundary>
								<FilterBar query={query!} />
							</ErrorBoundary>
						</VStack>
					</ErrorBoundary>
				</CardHeader>
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<ProductDocument>
								id="pos-products"
								query={query!}
								renderItem={renderItem}
								renderCell={renderCell}
								noDataMessage={t('common.no_products_found')}
								estimatedItemSize={100}
								TableFooterComponent={calcTaxes ? TableFooter : DataTableFooter}
								getItemType={(row) => row.original.document.type}
								tableConfig={tableConfig}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
};
