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

import { Actions } from './cells/actions';
import { Name } from './cells/name';
import { Price } from './cells/price';
import { SKU } from './cells/sku';
import { StockQuantity } from './cells/stock-quantity';
import { VariableActions } from './cells/variable-actions';
import { ProductVariationActions } from './cells/variation-actions';
import { ProductVariationName } from './cells/variation-name';
import { EngineOutageBanner } from './engine-outage-banner';
import { ProductGrid } from './grid';
import { UISettingsForm } from './ui-settings-form';
import { useBarcode } from './use-barcode';
import { ViewModeToggle } from './view-mode-toggle';
import { useT } from '../../../../contexts/translations';
import { DataTable, DataTableFooter, defaultRenderItem } from '../../components/data-table';
import { FilterBar } from '../../components/product/filter-bar';
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
import {
	QueryStateProvider,
	useQueryState,
	useQueryStateActions,
	useRelationalCollectionBinding,
} from '../../../../query';
import { normalizeQuerySortField } from '../../../../query/query-state-translator';

import type { QueryStateActions, QueryStateOf } from '../../../../query';
import type { SortFieldsByCollection } from '../../../../query/query-state-types';
import type { BindingDataTableFooterProps } from '../../components/data-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

const POS_PRODUCTS_PAGE_SIZE = 10;
const POS_PRODUCT_SORT_FIELDS = [
	'name',
	'sku',
	'barcode',
	'sortable_price',
	'date_created_gmt',
	'date_modified_gmt',
	'total_sales',
	'stock_quantity',
	'stock_status',
	'menu_order',
] as const satisfies readonly SortFieldsByCollection['products'][];
const DEFAULT_POS_PRODUCT_SORT = { field: 'name', direction: 'asc' } as const;

function isPOSProductSortField(field: unknown): field is SortFieldsByCollection['products'] {
	return POS_PRODUCT_SORT_FIELDS.some((sortField) => sortField === field);
}

function getPOSProductSort(
	sortBy: unknown,
	sortDirection: unknown
): QueryStateOf<'products'>['sort'] {
	const sortField = normalizeQuerySortField('products', sortBy);
	if (!isPOSProductSortField(sortField)) return DEFAULT_POS_PRODUCT_SORT;
	return { field: sortField, direction: sortDirection === 'desc' ? 'desc' : 'asc' };
}

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
function TableFooter(props: BindingDataTableFooterProps) {
	return (
		<DataTableFooter {...props}>
			<TaxBasedOn />
		</DataTableFooter>
	);
}

/**
 *
 */
function POSProductsContent({
	isColumn = false,
	showOutOfStock,
}: {
	isColumn?: boolean;
	showOutOfStock: boolean;
}) {
	const { uiSettings } = useUISettings('pos-products');
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const binding = useRelationalCollectionBinding(state);
	const tableActions = React.useMemo<
		Pick<QueryStateActions<'products'>, 'setSort' | 'extendLimit' | 'setFilter'>
	>(
		() => ({
			setSort: actions.setSort,
			extendLimit: actions.extendLimit,
			setFilter: actions.setFilter,
		}),
		[actions]
	);
	const { calcTaxes } = useTaxRates();
	const viewMode = useObservableEagerState(uiSettings.viewMode$);
	const sortBy = useObservableEagerState(uiSettings.sortBy$);
	const sortDirection = useObservableEagerState(uiSettings.sortDirection$);
	const [expandedRef, expanded$] = useObservableRef<ExpandedState>({} as ExpandedState);
	const t = useT();

	/**
	 * Barcode
	 */
	const { onKeyPress } = useBarcode(actions.setSearch, actions.clearSearch);

	/** UI settings are an external observable projected into committed query state. */
	React.useEffect(() => {
		if (showOutOfStock) {
			actions.clearFilter('stock_status');
		} else {
			actions.setFilter('stock_status', 'instock');
		}
	}, [actions, showOutOfStock]);

	/**
	 * Apply sort changes to query state. Both the settings control and the
	 * DataTable column headers write sortBy/sortDirection to uiSettings; reacting
	 * to those observables here keeps the grid (which has no headers) and the
	 * table in sync. An effect is required because UI settings are an external store.
	 */
	React.useEffect(() => {
		const sort = getPOSProductSort(sortBy, sortDirection);
		actions.setSort(sort.field, sort.direction);
	}, [actions, sortBy, sortDirection]);

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
				hideOutOfStockVariations: !showOutOfStock,
			},
		}),
		[expandedRef, expanded$, setRowExpanded, showOutOfStock]
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
										collectionName="products"
										placeholder={t('common.search_products')}
										className="flex-1"
										onKeyPress={onKeyPress}
										testID="search-products"
									/>
								</ErrorBoundary>
								<ViewModeToggle />
								<UISettingsDialog title={t('common.product_settings')}>
									<UISettingsForm />
								</UISettingsDialog>
							</HStack>
							<ErrorBoundary>
								<FilterBar />
							</ErrorBoundary>
							<ErrorBoundary>
								<EngineOutageBanner />
							</ErrorBoundary>
						</VStack>
					</ErrorBoundary>
				</CardHeader>
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense>
							{viewMode === 'grid' ? (
								<ProductGrid binding={binding} actions={tableActions} />
							) : (
								<DataTable<ProductDocument>
									id="pos-products"
									collectionName="products"
									resource={binding.resource}
									sort={state.sort}
									actions={tableActions}
									active$={binding.active$}
									total$={binding.total$}
									totalSource$={binding.totalSource$}
									sync={binding.sync}
									renderItem={renderItem}
									renderCell={renderCell}
									noDataMessage={t('common.no_products_found')}
									estimatedItemSize={100}
									TableFooterComponent={calcTaxes ? TableFooter : DataTableFooter}
									getItemType={(row) => row.original.document.type}
									tableConfig={tableConfig}
								/>
							)}
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}

export function POSProducts({ isColumn = false }) {
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);
	const initialSort = getPOSProductSort(uiSettings.sortBy, uiSettings.sortDirection);
	const initialFilters = showOutOfStock ? undefined : { stock_status: 'instock' as const };

	return (
		<QueryStateProvider
			key={showOutOfStock ? 'show-out-of-stock' : 'in-stock-only'}
			collection="products"
			initialPageSize={POS_PRODUCTS_PAGE_SIZE}
			initialSort={initialSort}
			initialFilters={initialFilters}
		>
			<POSProductsContent isColumn={isColumn} showOutOfStock={showOutOfStock} />
		</QueryStateProvider>
	);
}
