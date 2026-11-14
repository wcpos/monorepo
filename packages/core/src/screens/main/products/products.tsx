import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { flexRender } from '@tanstack/react-table';
import get from 'lodash/get';
import omit from 'lodash/omit';
import { useRouter } from 'expo-router';
import { useObservableRef } from 'observable-hooks';

import { type EngineRecord, type QueryHandle, useDocField } from '@wcpos/query';
import { usePointer } from '@wcpos/components/lib/device';
import { PaneStack } from '@wcpos/components/pane-stack';
import { Text } from '@wcpos/components/text';
import { TableHead, TableHeader, TableRow } from '@wcpos/components/table';
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
import { DataTable, DataTableFooter, getColumnStyle } from '../components/data-table';
import { DataTableRow } from '../components/data-table/rows';
import { DataTableSkeleton } from '../components/data-table/skeleton';
import { TableSurface } from '../components/data-table/surface';
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
import { useProductsQueryHandle, useQueryState, useQueryStateActions } from '../../../query';

import type { ExpandedState } from '@tanstack/react-table';
import type { VariationMatch } from '../../../query';
import type { DataTableFeatures, DataTableFooterProps } from '../components/data-table';
import type { Row, Table } from '../../../table-types';
import type { ListTable } from '../components/list-frame';

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

type ItemProps = {
	item: Row<ProductRow, DataTableFeatures>;
	index: number;
	table: Table<ProductRow, DataTableFeatures>;
};

/** The touch row, a variable product's with its variations button. */
function renderCoarseItem(props: ItemProps) {
	const { record } = props.item.original;
	return (
		<VirtualizedList.Item>
			<View testID={`data-table-row-${record.payload.slug ?? record.uuid}`}>
				{record.payload.type === 'variable' ? (
					<VariableRow {...props} />
				) : (
					<TouchRow record={record} />
				)}
			</View>
		</VirtualizedList.Item>
	);
}

function renderFineItem({ item, index, table }: ItemProps, openProduct?: (uuid: string) => void) {
	// The caret opens the product, a variable one's too (its variations open from the button under
	// its name); the row only while the Actions column is hidden. Inert when the cashier may not edit.
	const row = (
		<DataTableRow
			item={item}
			pressWhenActionsHidden={
				openProduct ? () => openProduct(item.original.record.uuid) : undefined
			}
		/>
	);
	if (item.original.record.payload.type === 'variable') {
		return <VariableProductRow item={item} index={index} table={table} row={row} />;
	}
	return <VirtualizedList.Item>{row}</VirtualizedList.Item>;
}

/**
 * The management variations under the crumb, as the row's inline expand draws them, under the
 * products table's head row (a fine pointer): the editable price cells need their labels.
 */
function DrillPane({
	target,
	stockStatus,
	openVariation,
}: {
	target: Drill;
	stockStatus?: string;
	openVariation?: (record: EngineRecord<'variations'>) => void;
}) {
	// The rows' columns are the products table's: re-read on a column change, with the row
	// taken from the live table each render, since the row captured at drill time keeps its
	// cells. No memo, so the rows below re-render with it (facebook/react#33057).
	'use no memo';
	const pointer = usePointer();
	const { uiSettings } = useUISettings('products');
	useDocField(uiSettings, (value) => value.columns);
	const table = target.row.table;
	const row = table.getRowModel().rowsById[target.row.id] ?? target.row;
	return (
		// Keyed by product and its starting query: another product, or the same one from another
		// chip, is a fresh query, never the last one's rows or filters.
		<VariationRowProvider
			key={`${row.id}:${JSON.stringify([target.matches, target.variationSearch])}`}
			row={row}
			initialMatches={target.matches}
			initialSearch={target.variationSearch}
		>
			{/* On the table's card, as the POS pane's DataTable is (DrillIn: each pane brings its own). */}
			<TableSurface testID="products-variations-surface">
				{pointer === 'fine' && <PaneHeadRow table={table} />}
				<ScrollView>
					{pointer === 'fine' ? (
						<Variations row={row} stockStatus={stockStatus} openVariation={openVariation} />
					) : (
						<InlineVariations row={row} stockStatus={stockStatus} />
					)}
				</ScrollView>
			</TableSurface>
		</VariationRowProvider>
	);
}

/** The products table's head over the pane's rows: plain labels at the rows' widths. */
function PaneHeadRow({ table }: { table: Drill['row']['table'] }) {
	// Mirrors `DataTableBody`'s head row (components/data-table), without its sort and resize.
	// No memo: the table instance is stable across a column change, so a compiled cache keyed
	// on it would keep the old labels over rows that already moved (facebook/react#33057).
	'use no memo';
	return (
		<TableHeader>
			{table.getHeaderGroups().map((group) => (
				<TableRow key={group.id} className="min-h-row border-border border-b">
					{group.headers.map((header, index) => (
						<TableHead
							key={header.id}
							className="min-h-row"
							style={getColumnStyle(
								index === group.headers.length - 1 &&
									!group.headers.some((h) => h.column.id === 'actions')
									? { ...header.column.columnDef.meta, width: undefined, flex: 1 }
									: header.column.columnDef.meta
							)}
						>
							<Text numberOfLines={1}>
								{flexRender(header.column.columnDef.header, header.getContext())}
							</Text>
						</TableHead>
					))}
				</TableRow>
			))}
		</TableHeader>
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

/**
 * Tables are expensive to render, so memoize all props.
 */
function ProductsList({
	handle,
	table,
}: {
	/** The relational products handle (roadmap#423): the list and its table read its snapshot. */
	handle: QueryHandle;
	table: ListTable<ItemProps>;
}) {
	const state = useQueryState<'products'>();
	const { calcTaxes } = useTaxSettings();
	const { saveCatalogueChange } = useCatalogueRecord();

	const [expandedRef, expanded$] = useObservableRef({} as ExpandedState);
	const router = useRouter();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
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
	// Dropped, not parked: restoring the search (or the style) must not bring the pane back.
	// Reset while rendering (React's "previous render" pattern), as `variations-pane.tsx` does.
	if (drill && !drilled) setDrill(null);
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
				expanded$,
				setRowExpanded,
				commit: ({
					document,
					changes,
				}: {
					document: EngineRecord<'products'> | EngineRecord<'variations'>;
					changes: Record<string, unknown>;
				}) =>
					// Whether it was saved (a refusal is already toasted), so the stock keypad's −
					// and + can take a refused step back.
					saveCatalogueChange(document, changes).then((saved) => !!saved),
				variationRenderCell,
				openVariation,
				// Read by the variations button and the attribute chips instead of expanding.
				drill: drillStyle ? drillTo : undefined,
				/**
				 * Expanded variation rows answer to the same Stock Status pill as the rows around
				 * them. `extraData` carries it into FlashList so rendered rows refresh when the
				 * pill changes; meta alone is invisible to the list's memoisation.
				 */
				variationStockStatus: state.filters.stock_status,
			},
			// The style too: the variations button and the touch row read `meta.drill` when they
			// render, so a flipped style must re-render them or they keep the other style's handler
			// (a drill the inline style drops, a toggle the drill style wipes) and the button wedges.
			extraData: [state.filters.stock_status, drillStyle],
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

	return (
		<PaneStack
			detail={drilled}
			renderDetail={(target) => (
				<DrillIn
					parent={target.row.original.record}
					back={() => setDrill(null)}
					renderPane={() => (
						<DrillPane
							target={target}
							stockStatus={state.filters.stock_status}
							openVariation={openVariation}
						/>
					)}
				/>
			)}
			paneClassName="bg-background"
			testID="products-pane-stack"
		>
			<DataTable<ProductRow>
				id="products"
				collectionName="products"
				handle={handle}
				sort={state.sort}
				cellsForRow={cellsForRow}
				estimatedItemSize={56}
				TableFooterComponent={calcTaxes ? TableFooter : DataTableFooter}
				getItemType={(row) => row.original.record.payload.type}
				tableConfig={tableConfig}
				{...table}
			/>
		</PaneStack>
	);
}

/** The list's column: the part of the page the Free preview overlay covers. */
function ProductsColumn() {
	const state = useQueryState<'products'>();
	const handle = useProductsQueryHandle(state);
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
	// The published products are the store's own list: any other status, search or pill narrows it.
	const narrowed =
		!!state.search ||
		!Object.entries(state.filters).every(([key, value]) =>
			key === 'status'
				? value === 'publish'
				: Array.isArray(value)
					? value.length === 0
					: value === undefined || value === ''
		);
	return (
		<ListColumn
			testID="products-body"
			id="products"
			chips={<FilterBar />}
			handle={handle}
			skeleton={<DataTableSkeleton id="products" />}
			renderRow={{
				coarse: renderCoarseItem,
				fine: (props) => renderFineItem(props, openProduct),
			}}
			narrowed={narrowed}
			empty={{
				title: t('products.no_products_yet'),
				description: t('products.no_products_yet_description'),
			}}
			noResults={{
				title: t('pos_products.nothing_matches_filters'),
				clear: t('pos_products.clear_filters'),
			}}
		>
			{(table) => <ProductsList handle={handle} table={table} />}
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
					<ProductsDisplayOptions />
				</ManagementBar>
			}
		>
			<ProductsColumn />
		</ListPage>
	);
}
