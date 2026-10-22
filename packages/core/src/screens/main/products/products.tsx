import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import omit from 'lodash/omit';
import { useObservableRef } from 'observable-hooks';

import type { EngineRecord, QueryHandle } from '@wcpos/query';
import { EmptyState } from '@wcpos/components/empty-state';
import { usePointer } from '@wcpos/components/lib/device';
import * as VirtualizedList from '@wcpos/components/virtualized-list';

import { ManagementBar } from '../components/management-bar';
import { DisplayOptions } from '../components/display-options';
import { ListColumn, ListPage } from '../components/list-frame';
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
import { DataTable, DataTableFooter } from '../components/data-table';
import { DataTableRow } from '../components/data-table/rows';
import { DataTableSkeleton } from '../components/data-table/skeleton';
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
import { useCatalogueRecord } from './commands/use-catalogue-record';
import { ProductBrands } from '../components/product/brands';
import { COGS } from './cells/cogs';
import {
	useDrawnHandle,
	useProductsQueryHandle,
	useQuerySnapshot,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { ExpandedState } from '@tanstack/react-table';
import type { QueryStateActions, SnapshotFields } from '../../../query';
import type { DataTableFeatures, DataTableFooterProps } from '../components/data-table';
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

/** The table's caption row with the tax notice beside the counts. */
function TableFooter(props: DataTableFooterProps) {
	return (
		<DataTableFooter {...props}>
			<TaxBasedOn />
		</DataTableFooter>
	);
}

// The list re-renders for the answer only; the table and the footer read their own fields.
const ANSWER_ONLY: SnapshotFields = [];

/**
 * Tables are expensive to render, so memoize all props.
 */
function ProductsList({
	handle,
}: {
	/** The relational products handle (roadmap#423): the list and its table read its snapshot. */
	handle: QueryHandle;
}) {
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
	const { saveCatalogueChange } = useCatalogueRecord();

	const [expandedRef, expanded$] = useObservableRef({} as ExpandedState);
	const t = useT();

	/**
	 * Barcode
	 */
	const pointer = usePointer();
	// Suspended on until the first answer (the body's boundary draws the skeleton); a changed
	// query keeps the current rows while the new handle answers (`useDrawnHandle`).
	const { result } = useQuerySnapshot(useDrawnHandle(handle), ANSWER_ONLY);
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
					void saveCatalogueChange(document, changes);
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
		[expandedRef, expanded$, setRowExpanded, saveCatalogueChange, state.filters.stock_status]
	);
	/* eslint-enable react-compiler/react-compiler */

	return (
		<>
			{pending && <View testID="products-searching-line" className="bg-primary h-0.5" />}
			<View className={`flex-1 ${pending ? 'opacity-60' : ''}`}>
				<DataTable<ProductRow>
					id="products"
					collectionName="products"
					handle={handle}
					sort={state.sort}
					actions={tableActions}
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

/** The list's column: the part of the page the Free preview overlay covers. */
function ProductsColumn() {
	const state = useQueryState<'products'>();
	const handle = useProductsQueryHandle(state);
	return (
		<ListColumn
			testID="products-body"
			chips={<FilterBar />}
			handle={handle}
			skeleton={<DataTableSkeleton id="products" />}
		>
			<ProductsList handle={handle} />
		</ListColumn>
	);
}

export function Products() {
	const t = useT();
	const actions = useQueryStateActions<'products'>();
	const { onKeyPress } = useBarcode(actions.setSearch);
	return (
		<ListPage
			testID="screen-products"
			pro="products"
			bar={
				<ManagementBar
					// No title: the search's placeholder names the page and the rail marks it (owner, 2026-10-18).
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
			}
		>
			<ProductsColumn />
		</ListPage>
	);
}
