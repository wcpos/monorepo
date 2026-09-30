import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import omit from 'lodash/omit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useObservableRef, useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import type { EngineRecord } from '@wcpos/query';
import { EmptyState } from '@wcpos/components/empty-state';
import { usePointer } from '@wcpos/components/lib/device';
import * as VirtualizedList from '@wcpos/components/virtualized-list';

import { ManagementBar } from '../components/management-bar';
import { DisplayOptions } from '../components/display-options';
import { withProAccess } from '../components/pro-guard';
import { ProductRow as TouchRow, VariableRow } from './row';
import { Actions } from './cells/actions';
import { Barcode } from './cells/barcode';
import { EditablePrice } from './cells/editable-price';
import { ProductName } from './cells/name';
import { Price } from './cells/price';
import { StockQuantity } from './cells/stock-quantity';
import { StockStatus } from './cells/stock-status';
import { VariationActions } from './cells/variation-actions';
import { ProductVariationName } from './cells/variation-name';
import { useBarcode } from './use-barcode';
import { useT } from '../../../contexts/translations';
import { DataTable, DataTableFooter } from '../components/data-table/v2';
import { DataTableRow } from '../components/data-table/v2/rows';
import { DataTableSkeleton } from '../components/data-table/v2/skeleton';
import { RecordDateCell } from '../components/record-date-cell';
import { ProductCategories } from '../components/product/categories';
import { FilterBar } from '../components/product/filter-bar';
import { ProductImage } from '../components/product/image';
import { ProductTags } from '../components/product/tags';
import { TaxBasedOn } from '../components/product/tax-based-on';
import { VariableProductImage } from '../components/product/variable-image';
import { VariableProductPrice } from '../components/product/variable-price';
import { VariableProductRow } from '../components/product/variable-product-row';
import { ProductVariationImage } from '../components/product/variation-image';
import { QuerySearchInput } from '../components/query-search-input';
import { useTaxSettings } from '../contexts/tax-rates';
import { useMutation } from '../hooks/mutations/use-mutation';
import { ProductBrands } from '../components/product/brands';
import { COGS } from './cells/cogs';
import {
	useQueryState,
	useQueryStateActions,
	useRelationalCollectionBinding,
} from '../../../query';

import type { ExpandedState } from '@tanstack/react-table';
import type { QueryStateActions } from '../../../query';
import type { BindingDataTableFooterProps, DataTableFeatures } from '../components/data-table/v2';
import type { Row, Table } from '../../../table-types';

type ProductRow = { record: EngineRecord<'products'> };

const cells = {
	simple: {
		actions: Actions,
		image: ProductImage,
		name: ProductName,
		barcode: Barcode,
		price: Price,
		regular_price: EditablePrice,
		sale_price: EditablePrice,
		date_created_gmt: RecordDateCell,
		date_modified_gmt: RecordDateCell,
		stock_quantity: StockQuantity,
		stock_status: StockStatus,
		categories: ProductCategories,
		tags: ProductTags,
		brands: ProductBrands,
		cost_of_goods_sold: COGS,
	},
	variable: {
		actions: Actions,
		image: VariableProductImage,
		name: ProductName,
		barcode: Barcode,
		regular_price: VariableProductPrice,
		price: VariableProductPrice,
		sale_price: VariableProductPrice,
		date_created_gmt: RecordDateCell,
		date_modified_gmt: RecordDateCell,
		stock_quantity: StockQuantity,
		stock_status: StockStatus,
		categories: ProductCategories,
		tags: ProductTags,
		brands: ProductBrands,
		cost_of_goods_sold: COGS,
	},
};

const variationCells = {
	actions: VariationActions,
	price: Price,
	name: ProductVariationName,
	sale_price: EditablePrice,
	regular_price: EditablePrice,
	stock_quantity: StockQuantity,
	date_created_gmt: RecordDateCell,
	date_modified_gmt: RecordDateCell,
	barcode: Barcode,
	stock_status: StockStatus,
	image: ProductVariationImage,
	categories: () => {},
	tags: () => {},
	brands: () => {},
	cost_of_goods_sold: COGS,
};

/**
 *
 */
export function cellsForRow(row: Row<ProductRow, DataTableFeatures>) {
	return row.original.record.payload.type === 'variable' ? cells.variable : cells.simple;
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
function renderFineItem({
	item,
	index,
	table,
}: {
	item: Row<ProductRow, DataTableFeatures>;
	index: number;
	table: Table<ProductRow, DataTableFeatures>;
}) {
	if (item.original.record.payload.type === 'variable') {
		return <VariableProductRow item={item} index={index} table={table} />;
	}
	return (
		<VirtualizedList.Item>
			<DataTableRow item={item} />
		</VirtualizedList.Item>
	);
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
 * Tables are expensive to render, so memoize all props.
 */
function ProductsList({ binding }: { binding: ReturnType<typeof useRelationalCollectionBinding> }) {
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();

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
	const { calcTaxes } = useTaxSettings();
	const { patch: productsPatch } = useMutation({ collectionName: 'products' });
	const { patch: variationsPatch } = useMutation({ collectionName: 'variations' });

	const [expandedRef, expanded$] = useObservableRef({} as ExpandedState);
	const t = useT();

	/**
	 * Barcode
	 */
	const pointer = usePointer();
	const result = useObservableSuspense(binding.resource);
	const deferredResult = React.useDeferredValue(result);
	const pending = deferredResult.searchState === 'pending' && deferredResult.hits.length > 0;
	const emptyStore =
		!state.search &&
		Object.entries(state.filters).every(([key, value]) =>
			key === 'status'
				? value === 'publish'
				: Array.isArray(value)
					? value.length === 0
					: value === undefined || value === ''
		);

	/**
	 * Table config
	 */
	/**
	 * Helper to set expanded state directly, bypassing TanStack's updater function
	 * which has a minification bug with computed property destructuring.
	 * Uses lodash/omit which doesn't have this issue.
	 */
	/* eslint-disable react-compiler/react-compiler -- expandedRef is a mutable ref from useObservableRef */
	const setRowExpanded = React.useCallback(
		(rowId: string, expanded: boolean) => {
			if (expanded) {
				expandedRef.current = {
					...(expandedRef.current as Record<string, boolean>),
					[rowId]: true,
				};
			} else {
				expandedRef.current = omit(expandedRef.current as Record<string, boolean>, rowId);
			}
		},
		[expandedRef]
	);

	const tableConfig = React.useMemo(
		() => ({
			manualExpanding: true,
			onExpandedChange: (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
				const value = typeof updater === 'function' ? updater(expandedRef.current) : updater;
				expandedRef.current = value;
			},
			getRowCanExpand: (row: Row<ProductRow, DataTableFeatures>) =>
				row.original.record.payload.type === 'variable',
			meta: {
				expandedRef,
				expanded$,
				setRowExpanded,
				onChange: ({
					document,
					changes,
				}: {
					document: EngineRecord<'products'> | EngineRecord<'variations'>;
					changes: Record<string, unknown>;
				}) => {
					if (document.payload.type === 'variation') {
						void variationsPatch({ document, data: changes });
					} else {
						void productsPatch({ document, data: changes });
					}
				},
				variationRenderCell,
				/**
				 * Expanded variation rows answer to the same Stock Status pill as the rows around
				 * them. `extraData` carries it into FlashList so rendered rows refresh when the
				 * pill changes; meta alone is invisible to the list's memoisation.
				 */
				variationStockStatus: state.filters.stock_status,
			},
			extraData: state.filters.stock_status,
		}),
		[
			expandedRef,
			expanded$,
			setRowExpanded,
			productsPatch,
			variationsPatch,
			state.filters.stock_status,
		]
	);
	/* eslint-enable react-compiler/react-compiler */

	return (
		<>
			<ErrorBoundary>
				<FilterBar />
			</ErrorBoundary>
			{pending && <View testID="products-searching-line" className="bg-primary h-0.5" />}
			<View className={`flex-1 ${pending ? 'opacity-60' : ''}`}>
				<DataTable<ProductRow>
					id="products"
					collectionName="products"
					binding={binding}
					resource={binding.resource}
					sort={state.sort}
					actions={tableActions}
					active$={binding.active$}
					total$={binding.total$}
					sync={binding.sync}
					renderItem={(props) =>
						pointer === 'fine' ? (
							renderFineItem(props)
						) : (
							<VirtualizedList.Item>
								<View
									testID={`data-table-row-${props.item.original.record.payload.slug ?? props.item.original.record.uuid}`}
								>
									{props.item.original.record.payload.type === 'variable' ? (
										<VariableRow {...props} />
									) : (
										<TouchRow record={props.item.original.record} />
									)}
								</View>
							</VirtualizedList.Item>
						)
					}
					cellsForRow={cellsForRow}
					noDataMessage={
						<EmptyState
							testID="no-data-message"
							size="surface"
							kind={emptyStore ? 'empty' : 'no-results'}
							title={t(
								emptyStore ? 'products.no_products_yet' : 'pos_products.nothing_matches_filters'
							)}
							description={emptyStore ? t('products.no_products_yet_description') : undefined}
							action={
								emptyStore
									? undefined
									: {
											label: t('pos_products.clear_filters'),
											onPress: () => {
												actions.resetFilters();
												actions.clearSearch();
											},
										}
							}
						/>
					}
					estimatedItemSize={56}
					TableFooterComponent={calcTaxes ? TableFooter : DataTableFooter}
					getItemType={(row) => row.original.record.payload.type}
					tableConfig={tableConfig}
				/>
			</View>
		</>
	);
}

function ProductsBody() {
	const state = useQueryState<'products'>();
	const binding = useRelationalCollectionBinding(state);
	return (
		<View testID="products-body" className="flex-1">
			<ErrorBoundary>
				<Suspense fallback={<DataTableSkeleton id="products" />}>
					<ProductsList binding={binding} />
				</Suspense>
			</ErrorBoundary>
		</View>
	);
}
const GuardedProductsBody = withProAccess(ProductsBody, 'products');

export function Products() {
	const { bottom } = useSafeAreaInsets();
	const t = useT();
	const actions = useQueryStateActions<'products'>();
	const { onKeyPress } = useBarcode(actions.setSearch);
	return (
		<View
			testID="screen-products"
			className="bg-background flex-1"
			style={{ paddingBottom: bottom || undefined }}
		>
			<ManagementBar
				title={t('common.products')}
				testID="products-bar"
				search={
					<QuerySearchInput
						collectionName="products"
						placeholder={t('common.search_products')}
						testID="search-products"
						clearTestID="search-products-clear"
						onKeyPress={onKeyPress}
					/>
				}
			>
				<DisplayOptions id="products" title={t('common.product_settings')} />
			</ManagementBar>
			<GuardedProductsBody />
		</View>
	);
}
