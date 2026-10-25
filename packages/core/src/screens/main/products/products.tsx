import * as React from 'react';
import { ScrollView, View } from 'react-native';

import get from 'lodash/get';
import omit from 'lodash/omit';
import { useRouter } from 'expo-router';
import { useObservableRef } from 'observable-hooks';

import { type EngineRecord, type QueryHandle, useDocField } from '@wcpos/query';
import { EmptyState } from '@wcpos/components/empty-state';
import { usePointer } from '@wcpos/components/lib/device';
import { PaneStack } from '@wcpos/components/pane-stack';
import * as VirtualizedList from '@wcpos/components/virtualized-list';

import { ManagementBar } from '../components/management-bar';
import { ListColumn, ListPage } from '../components/list-frame';
import { ProductsDisplayOptions } from './display-options';
import { InlineVariations, ProductRow as TouchRow, VariableRow } from './row';
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
import { VariationRowProvider } from '../components/product/variable-product-row/context';
import { Variations } from '../components/product/variable-product-row/variations';
import { setVariationMatch } from '../components/product/variation-matches';
// The POS panel's drill, shared across screens for now (LEDGER, 2026-10-25).
import { DrillIn } from '../pos/products/drill-in';
import { useSystemBack } from '../pos/products/browse/use-system-back';
import { useUISettings } from '../contexts/ui-settings';
import { ProductVariationImage } from '../components/product/variation-image';
import { QuerySearchInput } from '../components/query-search-input';
import { useProAccess } from '../contexts/pro-access';
import { useTaxSettings } from '../contexts/tax-rates';
import { useUserCapabilities } from '../hooks/use-user-capabilities';
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
import type { QueryStateActions, SnapshotFields, VariationMatch } from '../../../query';
import type { DataTableFeatures, DataTableFooterProps } from '../components/data-table';
import type { Row, Table } from '../../../table-types';

type ProductRow = {
	record: EngineRecord<'products'>;
	childrenSearchCount?: number;
	parentSearchTerm?: string;
};

/** A variable product drilled into (the POS panel's drill style), and where its pane starts. */
type Drill = {
	row: Row<ProductRow, DataTableFeatures>;
	/** The products search it opened under: a new search returns to the products. */
	search: string;
	/** A chip's attribute, or the products search that matched its variations. */
	matches?: VariationMatch[];
	variationSearch?: string;
};

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
function renderFineItem(
	{
		item,
		index,
		table,
	}: {
		item: Row<ProductRow, DataTableFeatures>;
		index: number;
		table: Table<ProductRow, DataTableFeatures>;
	},
	openProduct?: (uuid: string) => void
) {
	// The row is the open control on every pointer, as the touch row is: a variable product's
	// toggles its variations, a simple one's opens the product when the cashier may edit it.
	if (item.original.record.payload.type === 'variable') {
		return <VariableProductRow item={item} index={index} table={table} toggleOnPress />;
	}
	return (
		<VirtualizedList.Item>
			<DataTableRow
				item={item}
				onPress={openProduct ? () => openProduct(item.original.record.uuid) : undefined}
			/>
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
	const router = useRouter();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const openProduct =
		!readOnly && caps.canEditProducts
			? (uuid: string) =>
					router.push({
						pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
						params: { productId: uuid },
					})
			: undefined;
	const canOpenVariation = !readOnly && caps.canEditVariations;
	const openVariation = React.useMemo(
		() =>
			canOpenVariation
				? (record: EngineRecord<'variations'>) =>
						router.push({
							pathname: '/(app)/(drawer)/products/(modals)/edit/variation/[variationId]',
							params: { variationId: record.uuid },
						})
				: undefined,
		[canOpenVariation, router]
	);

	// One setting for both product lists: the POS panel's `variationsStyle`.
	const { uiSettings: posSettings } = useUISettings('pos-products');
	const drillStyle =
		(useDocField(posSettings, (value) => value.variationsStyle) ?? 'drill') === 'drill';
	const [drill, setDrill] = React.useState<Drill | null>(null);
	const drilled = drillStyle && drill && drill.search === state.search ? drill : null;
	const drillTo = React.useCallback(
		(row: Row<ProductRow, DataTableFeatures>, match?: VariationMatch) => {
			const found = !match && (row.original.childrenSearchCount ?? 0) > 0;
			setDrill({
				row,
				search: state.search,
				matches: match ? setVariationMatch([], match) : undefined,
				variationSearch: found ? row.original.parentSearchTerm : undefined,
			});
		},
		[state.search]
	);
	// Android's back closes the drill; with none open the press goes on to the system.
	useSystemBack(() => {
		if (!drilled) return false;
		setDrill(null);
		return true;
	});

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
	// No row stays expanded in the drill style.
	React.useEffect(() => {
		if (drillStyle) expandedRef.current = {};
	}, [drillStyle, expandedRef]);
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
				!drillStyle && row.original.record.payload.type === 'variable',
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
				openVariation,
				// Read by the variable row, its caret and its attribute chips instead of expanding.
				drill: drillStyle ? drillTo : undefined,
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
			saveCatalogueChange,
			state.filters.stock_status,
			openVariation,
			drillStyle,
			drillTo,
		]
	);
	/* eslint-enable react-compiler/react-compiler */

	// The management variations under the crumb, as the row's inline expand draws them; keyed by
	// product so a tap on another product mid-slide never shows the last one's rows.
	const renderVariations = (target: Drill) => (
		<VariationRowProvider
			key={target.row.id}
			row={target.row}
			initialMatches={target.matches}
			initialSearch={target.variationSearch}
		>
			<ScrollView>
				{pointer === 'fine' ? (
					<Variations
						row={target.row}
						stockStatus={state.filters.stock_status}
						openVariation={openVariation}
					/>
				) : (
					<InlineVariations row={target.row} stockStatus={state.filters.stock_status} />
				)}
			</ScrollView>
		</VariationRowProvider>
	);

	return (
		<>
			{pending && <View testID="products-searching-line" className="bg-primary h-0.5" />}
			<PaneStack
				detail={drilled}
				renderDetail={(target) => (
					<DrillIn
						parent={target.row.original.record}
						back={() => setDrill(null)}
						renderPane={() => renderVariations(target)}
					/>
				)}
				paneClassName="bg-background"
				testID="products-pane-stack"
			>
				<View className={`flex-1 ${pending ? 'opacity-60' : ''}`}>
					<DataTable<ProductRow>
						id="products"
						collectionName="products"
						handle={handle}
						sort={state.sort}
						actions={tableActions}
						renderItem={(props) =>
							pointer === 'fine' ? (
								renderFineItem(props, openProduct)
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
			</PaneStack>
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
					<ProductsDisplayOptions title={t('common.product_settings')} />
				</ManagementBar>
			}
		>
			<ProductsColumn />
		</ListPage>
	);
}
