import * as React from 'react';
import { View } from 'react-native';

import omit from 'lodash/omit';
import { useObservableRef } from 'observable-hooks';
import { type ExpandedState } from '@tanstack/react-table';

import { EmptyState } from '@wcpos/components/empty-state';
import { Skeleton, skeletonCount } from '@wcpos/components/skeleton';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Icon } from '@wcpos/components/icon';
import { PaneStack } from '@wcpos/components/pane-stack';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { EngineRecord } from '@wcpos/query';
import { useDocField } from '@wcpos/query';
import * as VirtualizedList from '@wcpos/components/virtualized-list';

import { useRegisterSession } from '../../../../../services/register-session/use-register-session';
import { CameraScanButton } from '../camera-scan-button';
import { CameraScannerPanel } from '../camera-scanner-panel';
import { StorageOutageBanner } from '../storage-outage-banner';
import { ProductGrid } from '../grid';
import { POS_PRODUCTS_MIN_PAGE_SIZE, TABLE_ROW_PX, TILE_TEXT_BLOCK_PX } from '../fit-page-size';
import { usePanelSide } from '../../contexts/overlay-side/v2';
import { UISettingsForm } from '../ui-settings-form';
import { POSFilterBar } from './filter-bar';
import { getPOSProductSort } from '../pos-product-sort';
import { useBarcode } from '../use-barcode';
import { useFitPageSize } from '../use-fit-page-size';
import { ViewModeToggle } from '../view-mode-toggle';
import { useT } from '../../../../../contexts/translations';
import { DataTable } from '../../../components/data-table/v2';
import { QuerySearchInput } from '../../../components/query-search-input';
import { UISettingsDialog } from '../../../components/ui-settings';
import { useUISettings } from '../../../contexts/ui-settings';
import { createReadonlyView, Slot } from '../../../../../extensions/slots';
import {
	QueryStateProvider,
	useQueryState,
	useQueryStateActions,
	useQueryStateStore,
	useRelationalCollectionBinding,
	useScopeKey,
} from '../../../../../query';
import { cellsForRow } from '../index';
import { ProductRow as ProductRowView } from './rows/product-row';
import { VariableProductRow } from './rows/variable-product-row';
import { ProductTile } from './grid/product-tile';
import { VariableProductTile } from './grid/variable-product-tile';
import { ProductsFooter } from './footer';
import { DealStack, type Measurable } from './deal-stack';
import { DrillIn } from './drill-in';
import { readBrowseBy } from './browse/browse-source';
import { BrowseStage } from './browse/browse-stage';
import { filtersAtBaseline } from './browse/use-browse-path';
import { DataTableSkeleton } from '../../../components/data-table/v2/skeleton';
import { ProductVariationActions } from '../cells/variation-actions';
import { ProductVariationName } from '../cells/variation-name';
import { ProductVariationImage } from '../../../components/product/variation-image';

import type { Row } from '../../../../../table-types';
import type { DataTableFeatures } from '../../../components/data-table/v2';
import type { QueryBinding, QueryStateActions, QueryStateOf } from '../../../../../query';
import type { SlotContracts } from '../../../../../extensions/slots';
export { cellsForRow };
type ProductRow = { record: EngineRecord<'products'> };
type DrillHandler = (record: EngineRecord<'products'> | null, target?: Measurable) => void;

/** Today's products grid or table, drilling variable products through `onDrill`. */
function ProductsView({
	onDrill,
	viewMode,
	loading,
	binding,
	tableActions,
	noDataMessage,
	sort,
	variationsStyle,
	tableConfig,
}: {
	onDrill: DrillHandler;
	viewMode: 'grid' | 'table';
	loading: React.ReactNode;
	binding: QueryBinding;
	tableActions: Pick<QueryStateActions<'products'>, 'setSort' | 'extendLimit' | 'setFilter'>;
	noDataMessage: React.ReactElement;
	sort: QueryStateOf<'products'>['sort'];
	variationsStyle: string;
	tableConfig: React.ComponentProps<typeof DataTable<ProductRow>>['tableConfig'];
}) {
	const VariableTile = React.useCallback(
		(props: React.ComponentProps<typeof ProductTile>) => (
			<VariableProductTile {...props} variationsStyle={variationsStyle} onDrill={onDrill} />
		),
		[variationsStyle, onDrill]
	);
	return (
		<Suspense fallback={loading}>
			{viewMode === 'grid' ? (
				<ProductGrid
					tile={ProductTile}
					variableTile={VariableTile}
					binding={binding}
					actions={tableActions}
					noDataMessage={noDataMessage}
				/>
			) : (
				<DataTable<ProductRow>
					id="pos-products"
					collectionName="products"
					binding={binding}
					resource={binding.resource}
					sort={sort}
					actions={tableActions}
					active$={binding.active$}
					total$={binding.total$}
					sync={binding.sync}
					renderItem={({ item, index, table }) => (
						<VirtualizedList.Item>
							{item.original.record.payload.type === 'variable' ? (
								<VariableProductRow
									item={item}
									index={index}
									table={table}
									variationsStyle={variationsStyle}
									onDrill={onDrill}
								/>
							) : (
								<ProductRowView item={item} />
							)}
						</VirtualizedList.Item>
					)}
					cellsForRow={cellsForRow}
					noDataMessage={noDataMessage}
					estimatedItemSize={100}
					TableFooterComponent={ProductsFooter}
					getItemType={(row) => row.original.record.payload.type}
					tableConfig={tableConfig}
				/>
			)}
		</Suspense>
	);
}

const POS_PRODUCTS_PAGE_SIZE = POS_PRODUCTS_MIN_PAGE_SIZE;
function POSProductsContent({
	showOutOfStock,
	initialFilters,
}: {
	showOutOfStock: boolean;
	initialFilters: Record<string, unknown>;
}) {
	const side = usePanelSide('products');
	const { session, sessionsOn } = useRegisterSession();
	const { uiSettings } = useUISettings('pos-products');
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const binding = useRelationalCollectionBinding(state);
	const stockStatusFilter = state.filters.stock_status;
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

	/**
	 * The filter-bar slot's two channels. Both are memoised on the store, not on state, so a
	 * keystroke re-renders the entries that subscribed to the view and nothing else.
	 *
	 * `data` hands out a CLONE of `{ search, filters }` — an entry must never hold a
	 * reference into the store, and the projection is plain data by contract.
	 */
	const store = useQueryStateStore<'products'>();
	const filterSlotData = React.useMemo(
		() =>
			createReadonlyView(store, (queryState) => ({
				search: queryState.search,
				filters: JSON.parse(
					JSON.stringify(queryState.filters)
				) as QueryStateOf<'products'>['filters'],
			})),
		[store]
	);
	const filterSlotApi = React.useMemo<SlotContracts['pos.products.filter-bar.item']['api']>(
		() => ({
			setFilter: async (field, value) => actions.setFilter(field, value),
			clearFilter: async (field) => actions.clearFilter(field),
			resetFilters: async () => actions.resetFilters(),
			setSearch: async (term) => actions.setSearch(term),
		}),
		[actions]
	);

	const viewMode = useDocField(uiSettings, (value) => value.viewMode) === 'grid' ? 'grid' : 'table';
	const variationsStyle = useDocField(uiSettings, (value) => value.variationsStyle) ?? 'drill';
	const browseBy = readBrowseBy(useDocField(uiSettings, (value) => value.browseBy));
	// The scope the products are read from: a same-site store or cashier switch changes it with
	// no change to the source, search, filters or path, and the stage's drill, held answers and
	// snapshots are the previous scope's records.
	const scopeKey = useScopeKey('products');
	// A drill-in remembers the search it opened under: typing a new product search is a return
	// to the products (the search writes to the outer query, which the pane does not show).
	const [drill, setDrill] = React.useState<{
		record: EngineRecord<'products'>;
		search: string;
		// The tile that was tapped, when it was a tile: the grid's deal starts from it.
		target?: Measurable;
	} | null>(null);
	const drilled = drill && drill.search === state.search ? drill.record : null;
	const setDrilled = React.useCallback(
		(record: EngineRecord<'products'> | null, target?: Measurable) =>
			setDrill(record ? { record, search: state.search, target } : null),
		[state.search]
	);
	// A drill does not outlive its stage: a browse source taking over (or handing back) starts
	// from its root, never under the old variations' filter bar, nor resurrecting their pane; a
	// scope switch drops it too (its record is the previous scope's). Dropped while rendering
	// (React's "previous render" pattern), so no frame shows it.
	const stageKey = `${browseBy}:${scopeKey}`;
	const [drillStage, setDrillStage] = React.useState(stageKey);
	if (drillStage !== stageKey) {
		setDrillStage(stageKey);
		setDrill(null);
	}
	// A product drilled inside the browse stage: the stage owns that drill; the filter bar reads it.
	const [browseDrilled, setBrowseDrilled] = React.useState(false);
	const gridColumns = useDocField(uiSettings, (value) => value.gridColumns);
	const sortBy = useDocField(uiSettings, (value) => value.sortBy);
	const sortDirection = useDocField(uiSettings, (value) => value.sortDirection);
	const [expandedRef, expanded$] = useObservableRef<ExpandedState>({} as ExpandedState);
	const [scannerOpen, setScannerOpen] = React.useState(false);
	const t = useT();
	const handleProductsLayout = useFitPageSize(actions.setPageSize, viewMode, gridColumns);
	const [body, setBody] = React.useState({ width: 0, height: 0 });
	// "No products yet" only when nothing narrows the baseline: no search and no filter beyond the
	// initial ones (published, and in stock unless the setting shows out-of-stock). Any other zero
	// is "nothing matches", with the way out (#308 rule 4).
	const emptyStore = !state.search && filtersAtBaseline(state.filters, initialFilters);
	const noDataMessage = (
		<EmptyState
			testID="no-data-message"
			size="surface"
			kind={emptyStore ? 'empty' : 'no-results'}
			title={t(
				emptyStore ? 'pos_products.no_products_yet' : 'pos_products.nothing_matches_filters'
			)}
			description={emptyStore ? t('pos_products.no_products_yet_description') : undefined}
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
	);
	const loading =
		viewMode === 'table' ? (
			<DataTableSkeleton id="pos-products" />
		) : (
			<View className="gap-2 p-2">
				{Array.from(
					{
						length: skeletonCount(
							body.height,
							viewMode === 'grid' ? body.width / gridColumns + TILE_TEXT_BLOCK_PX : TABLE_ROW_PX
						),
					},
					(_, row) => (
						<View key={row} className="flex-row gap-2">
							{Array.from({ length: viewMode === 'grid' ? gridColumns : 1 }, (_, column) => (
								<Skeleton
									key={column}
									shape={viewMode === 'grid' ? 'tile' : 'row'}
									className="flex-1"
								/>
							))}
						</View>
					)
				)}
			</View>
		);

	/**
	 * Barcode
	 */
	const { onKeyPress } = useBarcode(actions.setSearch, actions.clearSearch);

	/**
	 * UI settings are an external observable projected into committed query state.
	 * rebaseFilter (not setFilter) so the resetFilters baseline follows the toggle:
	 * clear-and-refresh must reset to the setting's stock_status, not the mount-time one.
	 */
	React.useEffect(() => {
		actions.rebaseFilter('stock_status', showOutOfStock ? undefined : 'instock');
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
	 *
	 * The expanded variation rows read the SAME Stock Status filter as the grid around them —
	 * the pill is the live control, `showOutOfStock` only seeds it above. `extraData` carries the
	 * filter into FlashList so already-rendered rows re-render when it changes; meta alone is
	 * invisible to the list's memoisation.
	 */
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
				variationRenderCell: ({ column }: { column: { id: string } }) =>
					({
						...cellsForRow({ original: { record: { payload: { type: 'simple' } } } } as Row<
							ProductRow,
							DataTableFeatures
						>),
						actions: ProductVariationActions,
						name: ProductVariationName,
						image: ProductVariationImage,
					})[column.id as keyof ReturnType<typeof cellsForRow>],
				variationStockStatus: stockStatusFilter,
			},
			extraData: stockStatusFilter,
		}),
		[expandedRef, expanded$, setRowExpanded, stockStatusFilter]
	);
	/* eslint-enable react-compiler/react-compiler */

	// The products stay mounted under a drill-in: the stage brings the variations over them and
	// takes them back off, and the list is where the cashier left it. A function of its drill
	// handler, so a browse stage can wire its own (All products mode drills through `setDrilled`).
	// Not memoised: `loading` and `noDataMessage` are fresh elements every render anyway. The tile
	// component identity that matters is memoised inside ProductsView, per drill handler.
	const renderProducts = (onDrill: DrillHandler) => (
		<ProductsView
			onDrill={onDrill}
			viewMode={viewMode}
			loading={loading}
			binding={binding}
			tableActions={tableActions}
			noDataMessage={noDataMessage}
			sort={state.sort}
			variationsStyle={variationsStyle}
			tableConfig={tableConfig}
		/>
	);
	const products = renderProducts(setDrilled);
	const renderDrillIn = (parent: EngineRecord<'products'>) => (
		<DrillIn
			parent={parent}
			back={() => setDrilled(null)}
			stockStatus={stockStatusFilter}
			tiles={viewMode === 'grid'}
		/>
	);

	return (
		<View className="h-full">
			<View className="flex-1">
				<View className="p-2">
					<ErrorBoundary>
						<VStack>
							<HStack>
								<ErrorBoundary>
									<QuerySearchInput
										collectionName="products"
										placeholder={t('pos_products.search_products')}
										className="flex-1"
										onKeyPress={onKeyPress}
										testID="search-products"
										clearTestID="search-products-clear"
									/>
								</ErrorBoundary>
								<CameraScanButton
									open={scannerOpen}
									onToggle={() => setScannerOpen((open) => !open)}
								/>
								<ViewModeToggle />
								<UISettingsDialog
									side={side}
									portalHost="pos"
									title={t('pos_products.product_settings')}
									triggerTestID="products-settings-button"
								>
									<UISettingsForm />
								</UISettingsDialog>
							</HStack>
							<ErrorBoundary>
								<Slot id="pos.products.filter-bar.item" data={filterSlotData} api={filterSlotApi} />
							</ErrorBoundary>
							<ErrorBoundary>
								<POSFilterBar
									level={drilled || browseDrilled ? 'variations' : 'products'}
									initialFilters={initialFilters}
								/>
							</ErrorBoundary>
							{scannerOpen ? (
								<ErrorBoundary>
									<CameraScannerPanel onClose={() => setScannerOpen(false)} />
								</ErrorBoundary>
							) : null}
							<ErrorBoundary>
								<StorageOutageBanner />
							</ErrorBoundary>
						</VStack>
					</ErrorBoundary>
				</View>
				{/* No rule here: the grid and the table each sit on their own card (TableSurface),
				    whose edge is the line. */}
				<View className="flex-1">
					{(session?.status === 'counting' || (!session && sessionsOn)) && (
						<View
							className="border-border bg-card mx-2 mb-2 flex-row items-center gap-2 rounded-lg border px-3 py-2.5"
							testID="products-locked-notice"
						>
							<Icon name="lock" className="text-muted-foreground" />
							<Text className="flex-1 text-sm">
								{t(
									session?.status === 'counting'
										? 'pos_products.counting_items_after_count'
										: 'pos_products.price_check_only_until_open'
								)}
							</Text>
						</View>
					)}
					<View
						className={`flex-1 ${session?.status === 'counting' ? 'opacity-40' : ''}`}
						testID="register-products"
						onLayout={(event) => {
							handleProductsLayout(event);
							setBody(event.nativeEvent.layout);
						}}
					>
						<ErrorBoundary>
							{/* Tiles are dealt out of the tile that was tapped; rows slide in as a pane. With
							    a browse source on, the stage owns search too: a search drops the path and
							    shows the catalogue-wide products at its root, drilling into the stage's
							    own drill; a shortcut's own search keeps its level. Keyed by source and
							    scope: either switch starts the stage afresh. */}
							{browseBy !== 'all' ? (
								<BrowseStage
									key={stageKey}
									source={browseBy}
									viewMode={viewMode}
									renderProducts={renderProducts}
									empty={noDataMessage}
									variationsStyle={variationsStyle}
									stockStatus={stockStatusFilter}
									binding={binding}
									state={state}
									actions={tableActions}
									tableConfig={tableConfig}
									onDrilledChange={setBrowseDrilled}
									initialFilters={initialFilters}
								/>
							) : viewMode === 'grid' ? (
								<DealStack
									testID="products-pane-stack"
									detail={drilled}
									target={drill?.target}
									renderDetail={renderDrillIn}
								>
									{products}
								</DealStack>
							) : (
								<PaneStack
									testID="products-pane-stack"
									detail={drilled}
									paneClassName="bg-background"
									renderDetail={renderDrillIn}
								>
									{products}
								</PaneStack>
							)}
						</ErrorBoundary>
					</View>
				</View>
			</View>
		</View>
	);
}

export function POSProducts() {
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useDocField(uiSettings, (value) => value.showOutOfStock);
	const initialSort = getPOSProductSort(uiSettings.sortBy, uiSettings.sortDirection);
	const initialFilters = {
		status: 'publish' as const,
		...(showOutOfStock ? {} : { stock_status: 'instock' as const }),
	};

	return (
		<QueryStateProvider
			collection="products"
			initialPageSize={POS_PRODUCTS_PAGE_SIZE}
			initialSort={initialSort}
			initialFilters={initialFilters}
		>
			<POSProductsContent showOutOfStock={showOutOfStock} initialFilters={initialFilters} />
		</QueryStateProvider>
	);
}
