import * as React from 'react';
import { type TextInputInstance, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import omit from 'lodash/omit';
import { useObservableRef } from 'observable-hooks';
import { type ExpandedState } from '@tanstack/react-table';

import { EmptyState } from '@wcpos/components/empty-state';
import { PosterPlaceholder } from '@wcpos/components/poster-tile';
import { skeletonCount } from '@wcpos/components/skeleton';
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
import { ProductGrid } from './grid/product-grid';
import { POS_PRODUCTS_MIN_PAGE_SIZE } from '../fit-page-size';
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
import { useRegisterSurface } from '../../../../../extensions/commands/use-register-surface';
import { tillHref } from '../../checkout/till-route';
import { createReadonlyView, Slot } from '../../../../../extensions/slots';
import {
	QueryStateProvider,
	useProductsQueryHandle,
	useQueryState,
	useQueryStateActions,
	useQueryStateStore,
	useScopeKey,
} from '../../../../../query';
import { cellsForRow } from './cells-for-row';
import { ProductRow as ProductRowView } from './rows/product-row';
import { VariableProductRow } from './rows/variable-product-row';
import { ProductsFooter } from './footer';
import { DealStack, type Measurable } from './deal-stack';
import { DrillIn } from './drill-in';
import { readBrowseBy } from './browse/browse-source';
import { BrowseStage } from './browse/browse-stage';
import { useReleaseBrowsePath } from './browse/use-browse-path';
import { usePersistedState } from '../../../../../contexts/persisted-state';
import { clearConditions, conditionsBeyond, type LevelPlace } from './browse/level-place';
import { useSystemBack } from './browse/use-system-back';
import { DataTableSkeleton } from '../../../components/data-table/v2/skeleton';
import { ProductVariationActions } from '../cells/variation-actions';
import { ProductVariationName } from '../cells/variation-name';
import { PosVariationImage } from '../cells/variation-image';
import { useMountProbe, useRenderProbe } from '../render-probe';

import type { Row } from '../../../../../table-types';
import type { DataTableFeatures } from '../../../components/data-table/v2';
import type { QueryHandle, QueryStateActions, QueryStateOf } from '../../../../../query';
import type { SlotContracts } from '../../../../../extensions/slots';
export { cellsForRow };
type ProductRow = { record: EngineRecord<'products'> };
type DrillHandler = (record: EngineRecord<'products'> | null, target?: Measurable) => void;

/** Troubleshooting probe (render-probe.ts): a Suspense fallback that logs when it is shown. */
function SuspendedProbe({ event, children }: { event: string; children: React.ReactNode }) {
	useMountProbe(event, 'products');
	return <>{children}</>;
}

/** Today's products grid or table, drilling variable products through `onDrill`. */
function ProductsView({
	onDrill,
	viewMode,
	loading,
	handle,
	tableActions,
	noDataMessage,
	sort,
	variationsStyle,
	tableConfig,
}: {
	onDrill: DrillHandler;
	viewMode: 'grid' | 'table';
	loading: React.ReactNode;
	/** The products query handle: the grid and the table read its snapshot (roadmap#423). */
	handle: QueryHandle;
	tableActions: Pick<QueryStateActions<'products'>, 'setSort' | 'extendLimit' | 'setFilter'>;
	noDataMessage: React.ReactElement;
	sort: QueryStateOf<'products'>['sort'];
	variationsStyle: string;
	tableConfig: React.ComponentProps<typeof DataTable<ProductRow>>['tableConfig'];
}) {
	useRenderProbe('ProductsView', 'view', {
		onDrill,
		viewMode,
		loading,
		handle,
		tableActions,
		noDataMessage,
		sort,
		variationsStyle,
		tableConfig,
	});
	// Both views suspend on the products handle until its first answer (the grid directly, the
	// table through its handle source); the boundary's fallback is the skeleton either way.
	return (
		<Suspense fallback={<SuspendedProbe event="products.suspended">{loading}</SuspendedProbe>}>
			{viewMode === 'grid' ? (
				<ProductGrid
					onDrill={onDrill}
					variationsStyle={variationsStyle}
					handle={handle}
					actions={tableActions}
					noDataMessage={noDataMessage}
				/>
			) : (
				<DataTable<ProductRow>
					id="pos-products"
					collectionName="products"
					handle={handle}
					sort={sort}
					actions={tableActions}
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
// A Poster tile is its square and its band: a grid row is the square, the band and the tile's two
// 4 px `m-1` margins (the legacy grid adds a 120 px text block instead, `TILE_TEXT_BLOCK_PX`).
const POSTER_ROW_MARGIN_PX = 8;
// The band (`POSTER_BAND`) at the base text scale, about 48 px. An estimate for the first page
// size and the skeleton only: the band itself is drawn from the type scale's variables.
const POSTER_BAND_ESTIMATE_PX = 48;
const POSTER_ROW_EXTRA_PX = POSTER_BAND_ESTIMATE_PX + POSTER_ROW_MARGIN_PX;
function POSProductsContent({
	showOutOfStock,
	initialFilters,
}: {
	showOutOfStock: boolean;
	initialFilters: Record<string, unknown>;
}) {
	const side = usePanelSide('products');
	const { session, sessionsOn } = useRegisterSession();
	// `pos.search.focus` focuses this input while the screen is mounted (roadmap#428). On a phone
	// both tabs stay mounted, so an unfocused Products tab is brought forward first and the input
	// takes focus once the tab is.
	const searchRef = React.useRef<TextInputInstance>(null);
	const searchPending = React.useRef(false);
	const isFocused = useIsFocused();
	const router = useRouter();
	React.useEffect(() => {
		if (!isFocused || !searchPending.current) return;
		searchPending.current = false;
		searchRef.current?.focus();
	}, [isFocused]);
	useRegisterSurface('search', () => {
		if (isFocused) return searchRef.current?.focus();
		searchPending.current = true;
		router.navigate(tillHref(true, 'products'));
	});
	const { uiSettings } = useUISettings('pos-products');
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const handle = useProductsQueryHandle(state);
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
	// Troubleshooting probe (render-probe.ts): a scope or handle change here remounts everything.
	useRenderProbe('POSProductsContent', 'content', {
		scopeKey,
		handle,
		state,
		actions,
		uiSettings,
		session,
		sessionsOn,
		side,
		viewMode,
		browseBy,
		variationsStyle,
	});
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
	// The browse path is kept per SCOPE across remounts (the register's layout swapping trees at
	// the phone boundary; see POSProducts): a stage for another source finds the last one's
	// projection and drops it, and All products mode releases it here.
	const browsePersistKey = `pos-browse:${scopeKey}`;
	useReleaseBrowsePath(browsePersistKey, browseBy === 'all');
	const [drillStage, setDrillStage] = React.useState(stageKey);
	if (drillStage !== stageKey) {
		setDrillStage(stageKey);
		setDrill(null);
	}
	// Android's back closes this screen's own drill (All products mode); with none open the press
	// goes on — to the browse stage's handler when a source is on, else the system's. One state
	// update, so it needs no batching.
	useSystemBack(() => {
		if (!drilled) return false;
		setDrill(null);
		return true;
	});
	// A product drilled inside the browse stage: the stage owns that drill; the filter bar reads it.
	const [browseDrilled, setBrowseDrilled] = React.useState(false);
	// A browse level open: its crumb is the place, so the source's own pill folds, the place's
	// own conditions are not groups to clear, and Clear filters leaves the place (level-place).
	const [browsePlace, setBrowsePlace] = React.useState<LevelPlace | null>(null);
	const gridColumns = useDocField(uiSettings, (value) => value.gridColumns);
	const sortBy = useDocField(uiSettings, (value) => value.sortBy);
	const sortDirection = useDocField(uiSettings, (value) => value.sortDirection);
	const [expandedRef, expanded$] = useObservableRef<ExpandedState>({} as ExpandedState);
	const [scannerOpen, setScannerOpen] = React.useState(false);
	const t = useT();
	const handleProductsLayout = useFitPageSize(
		actions.setPageSize,
		viewMode,
		gridColumns,
		POSTER_ROW_EXTRA_PX
	);
	const [body, setBody] = React.useState({ width: 0, height: 0 });
	// "No products yet" only when nothing narrows the baseline: no search and no filter beyond the
	// initial ones (published, and in stock unless the setting shows out-of-stock). Any other zero
	// is "nothing matches", with the way out (#308 rule 4) — when there is one: inside a browse
	// level the place stays and only the conditions go, so a level empty with no condition beyond
	// its place offers no Clear filters (the press would change nothing); its way back is the
	// crumb and the parent tile.
	const conditionsOn = conditionsBeyond(browsePlace, state, initialFilters);
	const emptyStore = !browsePlace && !conditionsOn;
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
				conditionsOn
					? {
							label: t('pos_products.clear_filters'),
							onPress: () => clearConditions(actions, state.filters, browsePlace),
						}
					: undefined
			}
		/>
	);
	const loading =
		viewMode === 'table' ? (
			<DataTableSkeleton id="pos-products" />
		) : (
			// The grid loads in the tiles' own shape, so the rows drawn are the rows counted.
			<View className="px-1">
				{Array.from(
					{ length: skeletonCount(body.height, body.width / gridColumns + POSTER_ROW_EXTRA_PX) },
					(_, row) => (
						<View key={row} className="flex-row">
							{Array.from({ length: gridColumns }, (_, column) => (
								<PosterPlaceholder key={column} testID="products-grid-skeleton" />
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
	 *
	 * Only when the setting MOVES against what the STORE last had applied, never on mount for its
	 * own sake: a new store was seeded from this same setting (POSProducts' initialFilters), and a
	 * store kept across a remount (the register's layout switching trees) carries the cashier's
	 * own stock pill, which the mount must not overwrite. The record of what was applied is kept
	 * with the store, not in this mount: a setting that moved while the screen was unmounted
	 * (another window of this device) still reaches the kept store on the next mount.
	 */
	const applied = usePersistedState(`pos-products:${scopeKey}:applied-settings`, () => {
		let record = { showOutOfStock, sortBy, sortDirection };
		return {
			get: () => record,
			set: (next: Partial<typeof record>) => {
				record = { ...record, ...next };
			},
		};
	});
	React.useEffect(() => {
		if (applied.get().showOutOfStock === showOutOfStock) return;
		applied.set({ showOutOfStock });
		actions.rebaseFilter('stock_status', showOutOfStock ? undefined : 'instock');
	}, [actions, applied, showOutOfStock]);

	/**
	 * Apply sort changes to query state. Both the settings control and the
	 * DataTable column headers write sortBy/sortDirection to uiSettings; reacting
	 * to those observables here keeps the grid (which has no headers) and the
	 * table in sync. An effect is required because UI settings are an external store.
	 * Only when the setting moves (as the stock effect above): a kept store carries the sort a
	 * shortcut set, which the mount must not overwrite.
	 */
	React.useEffect(() => {
		const last = applied.get();
		if (last.sortBy === sortBy && last.sortDirection === sortDirection) return;
		applied.set({ sortBy, sortDirection });
		const sort = getPOSProductSort(sortBy, sortDirection);
		actions.setSort(sort.field, sort.direction);
	}, [actions, applied, sortBy, sortDirection]);

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
						image: PosVariationImage,
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
	// Not memoised: `loading` and `noDataMessage` are fresh elements every render anyway.
	const renderProducts = (onDrill: DrillHandler) => (
		<ProductsView
			onDrill={onDrill}
			viewMode={viewMode}
			loading={loading}
			handle={handle}
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
										ref={searchRef}
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
									place={browsePlace}
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
						{/* A failed products read is thrown here; the fallback's reset asks the handle again. */}
						<ErrorBoundary onReset={() => handle.retry()}>
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
									handle={handle}
									state={state}
									actions={tableActions}
									tableConfig={tableConfig}
									onDrilledChange={setBrowseDrilled}
									onLevelChange={setBrowsePlace}
									persistKey={browsePersistKey}
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
	// The register's two layouts are two trees, and a window resized across the phone boundary
	// mounts this screen afresh in the other: the query (and the browse path over it, below) is
	// kept per scope under the POS layout's PersistedStateProvider, so the cashier is where they
	// were — same search, pills, sort and crumb.
	const scopeKey = useScopeKey('products');

	return (
		<QueryStateProvider
			collection="products"
			initialPageSize={POS_PRODUCTS_PAGE_SIZE}
			initialSort={initialSort}
			initialFilters={initialFilters}
			persistKey={`pos-products:${scopeKey}`}
		>
			<POSProductsContent showOutOfStock={showOutOfStock} initialFilters={initialFilters} />
		</QueryStateProvider>
	);
}
