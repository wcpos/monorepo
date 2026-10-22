import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import type { EngineRecord, QueryHandle, QueryResult } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { useDocField } from '@wcpos/query';

import {
	useDrawnHandle,
	useGuardedExtendLimit,
	useQueryHandleFields,
	useQueryHandleValue,
	useQuerySnapshot,
} from '../../../../../query';
import {
	logResultEmission,
	markSyncActive,
	probeEvent,
	RENDER_PROBE_ENABLED,
	useRenderProbe,
} from '../render-probe';
import { ProductGridFooter } from './grid-footer';
import { TileGrid, useGridColumns } from './tile-grid';
import { ProductTile } from './product-tile';
import { VariableProductTile } from './variable-product-tile';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { CaptionRowInset, TileGround } from '../../../components/data-table/surface';
import { ProductsFooter } from '../footer';

import type { QueryStateActions, SnapshotFields } from '../../../../../query';

const gridLogger = getLogger(['wcpos', 'pos', 'products', 'grid']);

type ProductHit = {
	record: EngineRecord<'products'>;
};

type ProductsResult = QueryResult;

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
 * re-render when the sync spinner flips or the census lands. It is the products caption row the
 * table view draws (owner, 2026-10-05: one caption row under either body; switching tiles and
 * list moves only the body), the tax notice included.
 */
function GridStatusFooter({
	handle,
	shown,
	drawnCount,
}: {
	/** The live handle: the spinner is the engine's now, whichever query is drawn. */
	handle: QueryHandle<ProductsResult>;
	/** The drawn handle: the total rides with its rows ("of N" holds until the next answers). */
	shown: QueryHandle<ProductsResult>;
	drawnCount: number;
}) {
	const { active } = useQueryHandleFields(handle, ACTIVE_FIELD);
	const { total } = useQueryHandleFields(shown, TOTAL_FIELD);
	// The tile grid's caption row: the inset DataTable's footer mount gives (surface.tsx).
	return (
		<CaptionRowInset>
			<ProductsFooter
				collectionName="products"
				active={active}
				total={total}
				sync={handle.sync}
				drawnCount={drawnCount}
			/>
		</CaptionRowInset>
	);
}
const ACTIVE_FIELD: SnapshotFields = ['active'];
const TOTAL_FIELD: SnapshotFields = ['total'];
// The grid body re-renders for the answer and the engine's paging opinion, nothing else.
const GRID_FIELDS: SnapshotFields = ['pending', 'exhausted'];

interface ProductGridProps {
	noDataMessage?: React.ReactElement;
	onDrill: React.ComponentProps<typeof VariableProductTile>['onDrill'];
	variationsStyle: string;
	/** The products query handle (roadmap#423): one snapshot, read here, nowhere else. */
	handle: QueryHandle<ProductsResult>;
	actions: Pick<QueryStateActions<'products'>, 'extendLimit'>;
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
	onDrill,
	variationsStyle,
}: ProductGridProps) {
	const { uiSettings } = useUISettings('pos-products');
	const gridColumns = useGridColumns();
	const gridFields = useDocField(uiSettings, (value) => value.gridFields) as GridFields;
	const t = useT();

	// Stale-while-loading, React's own way: a changed query is a new handle; while it suspends,
	// the grid keeps rendering the drawn (previous) one's rows. Within one handle, a new answer
	// is deferred too, so the rows re-chunk off the urgent path.
	const shown = useDrawnHandle(handle);
	const settling = shown !== handle;
	// One subscription, one object: rows, count and the engine's paging opinion, suspended on
	// until the first answer, thrown to the boundary on a failed read.
	const snapshot = useQuerySnapshot(shown, GRID_FIELDS);
	const deferredResult = React.useDeferredValue(snapshot.result);
	// A query that has not answered yet, or a deferred frame behind the answer, is in flight
	// for paging: the guard must not extend on the previous query's opinion (#1221), and the
	// footer must not call the previous page the end.
	const engine = {
		pending: snapshot.pending || settling || deferredResult !== snapshot.result,
		exhausted: snapshot.exhausted,
	};

	// Troubleshooting probe (render-probe.ts): the sync phase and result rows come from the first
	// child (EmissionProbe); here only the deferred catch-up and this component's own reasons.
	React.useEffect(() => {
		if (!RENDER_PROBE_ENABLED || deferredResult === snapshot.result) return;
		probeEvent('grid.deferred', { hits: deferredResult.hits.length }, 'grid');
	}, [deferredResult, snapshot.result]);
	useRenderProbe('ProductGrid', 'grid', {
		snapshot,
		settling,
		hits: deferredResult.hits,
		gridColumns,
		gridFields,
		handle,
		actions,
		uiSettings,
		t,
		onDrill,
		variationsStyle,
		noDataMessage,
	});

	// Guarded (#1221): pending blocks; full local reads extend regardless of exhaustion.
	// Short local reads stop unless the engine says more may exist.
	const handleEndReached = useGuardedExtendLimit(
		actions.extendLimit,
		deferredResult.hits.length,
		engine
	);

	/**
	 * Keep readable hits; the tile grid owns chunking and padding.
	 */
	const { products, skippedStaleHits } = React.useMemo(() => {
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
		return { products, skippedStaleHits: deferredResult.hits.length - products.length };
	}, [deferredResult.hits]);
	// What the footers report as "loaded": the rows the grid actually built, not the hits it
	// was handed — replication churn can hand over stale hits that are skipped above, and the
	// loaded-count is a referent E2E reads (#1345), so it must count rendered rows.
	const renderedCount = deferredResult.hits.length - skippedStaleHits;

	// Products vanishing from the grid during sync churn must be visible in the log
	// pipeline (cashier-full-information ruling), even though the grid self-heals
	// once sync catches up. One line per change, not per skipped hit.
	React.useEffect(() => {
		if (skippedStaleHits > 0) {
			// Lifecycle, not amber: the grid heals itself once sync catches up.
			gridLogger.info('Products grid skipped stale rows while sync catches up', {
				context: { skipped: skippedStaleHits },
			});
		}
	}, [deferredResult.hits, skippedStaleHits]);

	return (
		// Tiles are cards already: they sit straight on the ground (a card of cards framed the
		// deal's every move — owner, 2026-10-05). The footer beneath is the table's footer row.
		<View className="flex h-full flex-col">
			{RENDER_PROBE_ENABLED ? <EmissionProbe handle={handle} /> : null}
			<TileGround>
				<TileGrid
					testID="pos-products-grid-scroller"
					tiles={products}
					renderTile={({ record }) =>
						record.payload.type === 'variable' ? (
							<VariableProductTile
								key={record.uuid}
								record={record}
								gridFields={gridFields}
								onDrill={onDrill}
								variationsStyle={variationsStyle}
							/>
						) : (
							<ProductTile key={record.uuid} record={record} gridFields={gridFields} />
						)
					}
					onEndReached={handleEndReached}
					footer={
						<ProductGridFooter
							engine={engine}
							renderedCount={renderedCount}
							hitCount={deferredResult.hits.length}
						/>
					}
					empty={() => (
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
			</TileGround>
			<GridStatusFooter handle={handle} shown={shown} drawnCount={renderedCount} />
		</View>
	);
}
