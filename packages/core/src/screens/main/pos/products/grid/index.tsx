import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { EngineRecord, QueryHandle, QueryResult } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { useDocField } from '@wcpos/query';

import {
	useGuardedExtendLimitFor,
	useQueryHandleValue,
	useQueryHandleView,
} from '../../../../../query';
import {
	logResultEmission,
	markSyncActive,
	probeEvent,
	RENDER_PROBE_ENABLED,
	useRenderProbe,
} from '../render-probe';
import { ProductGridFooter } from './grid-footer';
import { ProductTile } from './product-tile';
import { VariableProductTile } from './variable-product-tile';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { DataTableFooterFor } from '../../../components/data-table/footer';
import { TaxBasedOn } from '../../../components/product/tax-based-on';
import { useTaxSettings } from '../../../contexts/tax-rates';

import type { RxCollection } from 'rxdb';
import type { QueryStateActions, SnapshotFields } from '../../../../../query';

const gridLogger = getLogger(['wcpos', 'pos', 'products', 'grid']);

type ProductHit = {
	record: EngineRecord<'products'>;
};

type ProductsResult = QueryResult<RxCollection>;

/**
 * Troubleshooting probe (render-probe.ts), hosted by the grid's FIRST child. Effects run
 * children-first and in tree order, so a leaf placed before the list (1) seeds the sync phase
 * from the snapshot's `active` and (2) advances the emission counter — both BEFORE any tile's
 * render row in the same commit is stamped, including the first commit of a grid whose sync is
 * already active. A deferred value catching up is the same result committing again: no second
 * row.
 */
function EmissionProbe({ handle }: { handle: QueryHandle<ProductsResult> }) {
	// Every field: the probe is a leaf, its re-renders reach nothing.
	const { active, pending, exhausted, total, result } = useQueryHandleValue(handle);
	React.useEffect(() => {
		if (RENDER_PROBE_ENABLED) markSyncActive(active);
	}, [active]);
	React.useEffect(() => {
		if (RENDER_PROBE_ENABLED) probeEvent('handle.pending', { pending });
	}, [pending]);
	React.useEffect(() => {
		if (RENDER_PROBE_ENABLED) probeEvent('handle.exhausted', { exhausted });
	}, [exhausted]);
	React.useEffect(() => {
		if (RENDER_PROBE_ENABLED) probeEvent('handle.total', { total });
	}, [total]);
	const previousHits = React.useRef<ProductsResult['hits'] | null>(null);
	React.useEffect(() => {
		if (!RENDER_PROBE_ENABLED) return;
		logResultEmission(previousHits.current, result.hits, {
			// `count` in the row is the loaded hits; `total` is the engine's count for the query.
			total: result.count,
			searchState: result.searchState ?? null,
		});
		previousHits.current = result.hits;
	}, [result]);
	return null;
}

/**
 * The status row under the grid, reading `active` and `total` itself so the grid body does not
 * re-render when the sync spinner flips or the census lands.
 */
function GridStatusFooter({
	handle,
	count,
	children,
}: {
	handle: QueryHandle<ProductsResult>;
	count: number;
	children?: React.ReactNode;
}) {
	// The total rides with the drawn rows (a changed query keeps "of N" until it answers); the
	// spinner is the engine's now, whichever query is drawn.
	const { value, current } = useQueryHandleView(handle, STATUS_FIELDS);
	return (
		<DataTableFooterFor
			collectionName="products"
			active={current.active}
			total={value.total}
			sync={handle.sync}
			count={count}
		>
			{children}
		</DataTableFooterFor>
	);
}
const STATUS_FIELDS: SnapshotFields = ['active', 'total'];
// The grid body re-renders for the answer and the engine's paging opinion, nothing else.
const GRID_FIELDS: SnapshotFields = ['pending', 'exhausted'];

interface ProductGridProps {
	noDataMessage?: React.ReactElement;
	tile?: React.ComponentType<React.ComponentProps<typeof ProductTile>>;
	variableTile?: React.ComponentType<React.ComponentProps<typeof VariableProductTile>>;
	/** The products query handle (roadmap#423): one snapshot, read here, nowhere else. */
	handle: QueryHandle<ProductsResult>;
	actions: Pick<QueryStateActions<'products'>, 'extendLimit'>;
	/** Drawn until the handle's first answer — the gate that used to be a Suspense boundary. */
	loading?: React.ReactNode;
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

export function ProductGrid({
	handle,
	actions,
	noDataMessage,
	loading = null,
	tile: Tile = ProductTile,
	variableTile: VariableTile = VariableProductTile,
}: ProductGridProps) {
	const { uiSettings } = useUISettings('pos-products');
	const gridColumns = useDocField(uiSettings, (value) => value.gridColumns);
	const gridFields = useDocField(uiSettings, (value) => value.gridFields) as GridFields;
	const { calcTaxes } = useTaxSettings();
	const t = useT();

	// One subscription, one object: rows, count, total, activity and the engine's paging
	// opinion arrive together. A changed query keeps the current rows until it answers.
	const { value: current, settling, error } = useQueryHandleView(handle, GRID_FIELDS);
	// The WHOLE snapshot is deferred, gate included: an urgent commit of "ready" with the
	// deferred rows still empty would draw the empty state for a frame on every cold open.
	const snapshot = React.useDeferredValue(current);
	const deferredResult = snapshot.result;
	// A query that has not answered yet, or a deferred frame behind the answer, is in flight
	// for paging: the guard must not extend on the previous query's opinion (#1221), and the
	// footer must not call the previous page the end.
	const engine = {
		pending: snapshot.pending || settling || snapshot !== current,
		exhausted: snapshot.exhausted,
	};

	// Troubleshooting probe (render-probe.ts): the sync phase and result rows come from the first
	// child (EmissionProbe); here only the deferred catch-up and this component's own reasons.
	React.useEffect(() => {
		if (!RENDER_PROBE_ENABLED || snapshot === current) return;
		probeEvent('grid.deferred', { hits: snapshot.hits.length }, 'grid');
	}, [current, snapshot]);
	useRenderProbe('ProductGrid', 'grid', {
		current,
		snapshot,
		settling,
		hits: deferredResult.hits,
		gridColumns,
		gridFields,
		handle,
		actions,
		uiSettings,
		calcTaxes,
		t,
		Tile,
		VariableTile,
		noDataMessage,
	});

	// Guarded (#1221): pending blocks; full local reads extend regardless of exhaustion.
	// Short local reads stop unless the engine says more may exist.
	const handleEndReached = useGuardedExtendLimitFor(
		actions.extendLimit,
		deferredResult.hits.length,
		engine
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
	// What the footers report as "loaded": the rows the grid actually built, not the hits it
	// was handed — replication churn can hand over stale hits that are skipped above, and the
	// loaded-count is a referent E2E reads (#1345), so it must count rendered rows.
	const renderedCount = deferredResult.hits.length - skippedStaleHits;

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

	// A failed read reaches the screen's ErrorBoundary as it did through the Suspense resource;
	// a reader mounted over the failure (the boundary's reset) has asked the handle again and
	// draws the loading state until it answers.
	if (error) throw error;
	if (!snapshot.ready) return <>{loading}</>;

	return (
		// Tiles are cards already: they sit straight on the ground (a card of cards framed the
		// deal's every move — owner, 2026-10-05). The footer beneath is the table's footer row.
		<View className="flex h-full flex-col px-1">
			{RENDER_PROBE_ENABLED ? <EmissionProbe handle={handle} /> : null}
			<VirtualizedList.Root testID="pos-products-grid-scroller" style={{ flex: 1 }}>
				<VirtualizedList.List
					data={rows}
					renderItem={({ item: row }) => (
						<VirtualizedList.Item>
							<View className="flex-row">
								{row?.map(({ record }) =>
									record.payload.type === 'variable' ? (
										<VariableTile key={record.uuid} record={record} gridFields={gridFields} />
									) : (
										<Tile key={record.uuid} record={record} gridFields={gridFields} />
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
						<ProductGridFooter
							engine={engine}
							renderedCount={renderedCount}
							hitCount={deferredResult.hits.length}
						/>
					}
					ListEmptyComponent={() => (
						<View className="items-center justify-center p-4">
							{/* "No products found" may only ever mean the search ANSWERED with
							    nothing; a pending search says so instead (#1733). */}
							{deferredResult.searchActive && deferredResult.searchState === 'pending' ? (
								<Text testID="search-pending-message">{t('common.searching')}</Text>
							) : (
								(noDataMessage ?? (
									<Text testID="no-data-message">{t('common.no_products_found')}</Text>
								))
							)}
						</View>
					)}
				/>
			</VirtualizedList.Root>
			{/* The footer draws its own top line; a bordered wrapper here doubled it. */}
			{calcTaxes ? (
				<GridStatusFooter handle={handle} count={renderedCount}>
					<TaxBasedOn />
				</GridStatusFooter>
			) : (
				<GridStatusFooter handle={handle} count={renderedCount} />
			)}
		</View>
	);
}
