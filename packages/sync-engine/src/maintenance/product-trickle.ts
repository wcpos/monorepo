/**
 * IDLE CATALOG BACKFILL, IN THE CASHIER'S OWN ORDER (#1286; re-pointed 2026-08-19).
 *
 * One polite page of products per idle tick, so a till that has only ever seen what it
 * searched for converges on the whole catalogue and can sell offline.
 *
 * Paul's ruling, 2026-08-19, which this lane now follows:
 *
 * > "The store owner will set a default sort order and that should be the governing
 * > principle of which products come down first. Say if the cashier sets the products to be
 * > in stock products in alphabetical order then that should be the products that come down
 * > first in that order." … "And then if they say they change the sort order to created
 * > first, then that should be the order that the products are coming down, trickling down
 * > in."
 *
 * So the walk is no longer `orderby=id&order=asc` — an order nobody chose and nobody sees.
 * It follows the PRODUCT BROWSE WINDOW the grid last declared
 * (product-browse-window-descriptor.ts): the same sort and the same representable filters
 * the cashier is looking at, translated by the same `productBrowseWindowQueryParams` the
 * drain fetcher uses. The merchant's default `pos-products` sort needs no settings port —
 * it is what the grid mounts with, so it arrives as declared demand like any other sort.
 *
 * TWO STAGES, because filters PRIORITISE and do not EXCLUDE:
 *
 *  1. `'window'` — walk the cashier's filtered view (in-stock, alphabetical) to the end.
 *  2. `'catalog'` — same sort, filters dropped, from page 1. Out-of-stock products still
 *     land eventually, so the till stays fully sellable offline.
 *
 * RE-POINTING IS A RESTART, deliberately. The durable cursor is keyed by the window's VIEW
 * identity (sort + filters, limit-independent), so changing the sort restarts the walk at
 * page 1 of the new order — which is exactly what the ruling asks for. Re-downloading a
 * page of already-local products is the price; `bulkUpsert` absorbs it.
 *
 * The gating is untouched (idle >= 60s, no interactive demand, write-plane owner,
 * pressure-deferred, one request per tick, `manualSync: false`).
 */

import { assertBulkSuccess } from '@wcpos/sync-core';

import { COLLECTION_DESCRIPTORS } from '../collections/collection-descriptors';
import { manifestRowsForApplied } from '../local-coverage/existence-manifest-population';
import { upsertManifestRows } from '../local-coverage/rx-existence-manifest-repository';
import {
	barcodeSelectorsFor,
	type BarcodeSelectorsReader,
} from '../materialization/barcode-selectors';
import { materializeTargeted } from '../materialization/record-materialization';
import {
	type CensusTotal,
	hasProductBrowseWindowFilters,
	parseProductBrowseWindowDescriptor,
	PRODUCT_BROWSE_WINDOW_LIMIT,
	PRODUCT_BROWSE_WINDOW_ORDER,
	PRODUCT_BROWSE_WINDOW_ORDERBY,
	type ProductBrowseWindowDescriptor,
	productBrowseWindowQueryParams,
	productBrowseWindowViewKey,
} from '../scheduler';
import { withoutLocallyProtected } from '../write-path/local-work-guard';

import type { RxDatabase } from 'rxdb';

export const PRODUCT_TRICKLE_BATCH_SIZE = 10;
export const PRODUCT_TRICKLE_IDLE_AFTER_MS = 60_000;
export const PRODUCT_TRICKLE_STATE_KEY = 'product-trickle:state';

/**
 * The window walked when no grid has declared one this session — the POS default catalog
 * sort, i.e. the same order `product-browse-window-seed` seeds a cold grid in.
 */
const DEFAULT_BROWSE_WINDOW: ProductBrowseWindowDescriptor = {
	limit: PRODUCT_BROWSE_WINDOW_LIMIT,
	orderby: PRODUCT_BROWSE_WINDOW_ORDERBY,
	order: PRODUCT_BROWSE_WINDOW_ORDER,
};

/** Which half of the two-stage walk a cursor is in. See the module docblock. */
export type ProductTrickleStage = 'window' | 'catalog';

export type ProductTrickleState = {
	/** The browse window's VIEW identity — sort + filters, limit-independent. */
	viewKey: string;
	stage: ProductTrickleStage;
	page: number;
	walkComplete: boolean;
	observedCensusTotal: number | null;
};
export type ProductTrickleStateStore = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
};
const DEFAULT_STATE: ProductTrickleState = {
	// No view: any real window mismatches it and restarts the walk. That is also how a
	// cursor persisted by the old id-ascending walk retires itself.
	viewKey: '',
	stage: 'window',
	page: 1,
	walkComplete: false,
	observedCensusTotal: null,
};
export function decodeProductTrickleState(raw: string | null): ProductTrickleState {
	if (raw === null) return { ...DEFAULT_STATE };
	try {
		const parsed = JSON.parse(raw) as Partial<ProductTrickleState>;
		if (
			!Number.isSafeInteger(parsed.page) ||
			(parsed.page ?? 0) < 1 ||
			typeof parsed.walkComplete !== 'boolean' ||
			typeof parsed.viewKey !== 'string' ||
			(parsed.stage !== 'window' && parsed.stage !== 'catalog') ||
			(parsed.observedCensusTotal !== null &&
				(!Number.isSafeInteger(parsed.observedCensusTotal) ||
					(parsed.observedCensusTotal ?? -1) < 0))
		) {
			return { ...DEFAULT_STATE };
		}
		return {
			viewKey: parsed.viewKey,
			stage: parsed.stage,
			page: parsed.page!,
			walkComplete: parsed.walkComplete,
			observedCensusTotal: parsed.observedCensusTotal ?? null,
		};
	} catch {
		return { ...DEFAULT_STATE };
	}
}
export type ProductTrickleTickResult =
	| {
			status: 'ran';
			rows: number;
			page: number;
			walkComplete: boolean;
			stage: ProductTrickleStage;
			orderby: string;
			order: string;
	  }
	| { status: 'skipped'; reason: 'user-active' | 'interactive-demand' | 'in-flight' }
	| { status: 'idle'; reason: 'walk-complete' };
export type ProductTrickleDeps = {
	baseUrl: string;
	database: RxDatabase;
	fetcher: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	stateStore: ProductTrickleStateStore;
	hasPendingWork: () => boolean;
	productCensusTotal: () => Promise<CensusTotal | null>;
	barcodeSelectors?: BarcodeSelectorsReader;
	/**
	 * The lane key of the products browse window the grid last declared — the cashier's
	 * current sort and filters (`RequirePlane.lastProductBrowseQueryKey`). Absent or
	 * unparseable falls back to {@link DEFAULT_BROWSE_WINDOW}.
	 */
	currentBrowseWindowKey?: () => string | null;
	now: () => number;
	lastUserActivityMs?: () => number;
	signal?: AbortSignal;
};

/** The window this tick walks, and the cursor identity + opening stage that go with it. */
function resolveBrowseWindow(deps: ProductTrickleDeps): {
	browseWindow: ProductBrowseWindowDescriptor;
	viewKey: string;
	openingStage: ProductTrickleStage;
} {
	const key = deps.currentBrowseWindowKey?.() ?? null;
	const browseWindow =
		(key === null ? null : parseProductBrowseWindowDescriptor(key)) ?? DEFAULT_BROWSE_WINDOW;
	return {
		browseWindow,
		viewKey: productBrowseWindowViewKey(browseWindow),
		// An unfiltered window has no filtered stage to walk first.
		openingStage: hasProductBrowseWindowFilters(browseWindow) ? 'window' : 'catalog',
	};
}
const inFlightDatabases = new WeakSet<RxDatabase>();
export function tickProductTrickle(deps: ProductTrickleDeps): Promise<ProductTrickleTickResult> {
	if (inFlightDatabases.has(deps.database)) {
		return Promise.resolve({ status: 'skipped', reason: 'in-flight' });
	}
	inFlightDatabases.add(deps.database);
	return runProductTrickle(deps).finally(() => {
		inFlightDatabases.delete(deps.database);
	});
}
async function runProductTrickle(deps: ProductTrickleDeps): Promise<ProductTrickleTickResult> {
	if (
		deps.lastUserActivityMs &&
		deps.now() - deps.lastUserActivityMs() < PRODUCT_TRICKLE_IDLE_AFTER_MS
	) {
		return { status: 'skipped', reason: 'user-active' };
	}
	if (deps.hasPendingWork()) {
		return { status: 'skipped', reason: 'interactive-demand' };
	}

	const { browseWindow, viewKey, openingStage } = resolveBrowseWindow(deps);
	const restart: ProductTrickleState = {
		...DEFAULT_STATE,
		viewKey,
		stage: openingStage,
	};
	let state = decodeProductTrickleState(await deps.stateStore.get(PRODUCT_TRICKLE_STATE_KEY));
	// The cashier re-pointed the grid (or this is the first tick since the old id-walk):
	// the order changed, so the walk starts again in the new order.
	if (state.viewKey !== viewKey) state = restart;
	if (state.walkComplete) {
		const census = await deps.productCensusTotal();
		if (census?.fresh && census.total !== state.observedCensusTotal) {
			state = restart;
		} else {
			return { status: 'idle', reason: 'walk-complete' };
		}
	}

	const query = productBrowseWindowQueryParams(browseWindow, {
		omitFilters: state.stage === 'catalog',
	});
	query.set('per_page', String(PRODUCT_TRICKLE_BATCH_SIZE));
	query.set('page', String(state.page));
	const url = `${deps.baseUrl}/products?${query.toString()}`;
	const ran = (rows: number, page: number, walkComplete: boolean, stage: ProductTrickleStage) =>
		({
			status: 'ran',
			rows,
			page,
			walkComplete,
			stage,
			orderby: browseWindow.orderby,
			order: browseWindow.order,
		}) as const;
	const response = await deps.fetcher(url, deps.signal ? { signal: deps.signal } : undefined);
	if (!response.ok) {
		if (response.status === 400) {
			// Deliberate swallow (#1345): best-effort parse of an ALREADY-failed response
			// for the one rewindable code — a malformed body falls through to the thrown
			// HTTP error below, so no failure is hidden.
			const error = (await response.json().catch(() => null)) as { code?: unknown } | null;
			if (error?.code === 'rest_post_invalid_page_number') {
				// Records were deleted under the cursor: rewind THIS stage of THIS view rather
				// than discarding the view identity, which would restart the whole walk.
				await deps.stateStore.set(PRODUCT_TRICKLE_STATE_KEY, JSON.stringify({ ...state, page: 1 }));
				return ran(0, state.page, false, state.stage);
			}
		}
		throw new Error(`/products trickle pull failed: HTTP ${response.status}`);
	}
	const descriptor = COLLECTION_DESCRIPTORS.find(({ collection }) => collection === 'products');
	if (!descriptor || descriptor.shape !== 'targeted') {
		throw new Error('Product trickle requires the targeted products descriptor');
	}
	const payloads = descriptor.parse((await response.json()) as unknown);
	const selectors = barcodeSelectorsFor(deps.barcodeSelectors?.(), 'products');
	const materialized = payloads.map((payload) =>
		materializeTargeted('products', payload, selectors)
	);
	const documents = materialized.map(({ storedDocument }) => storedDocument);
	const applicable = await withoutLocallyProtected(
		deps.database.collections.products as never,
		documents as { uuid: string }[]
	);
	if (applicable.length > 0) {
		assertBulkSuccess(
			await deps.database.collections.products.bulkUpsert(applicable as never[]),
			'product-trickle upsert'
		);
	}
	// Rows for the documents this walk actually STORED — the guard-protected ones keep whatever
	// the manifest already holds for them (the row travels on the envelope, ADR 0028 rider).
	const manifestRows = manifestRowsForApplied(materialized, applicable as { uuid: string }[]);
	await upsertManifestRows(deps.database.collections.existenceManifest as never, manifestRows);

	const totalPagesHeader = response.headers.get('X-WP-TotalPages');
	const totalPages = Number(totalPagesHeader);
	const stageExhausted =
		payloads.length < PRODUCT_TRICKLE_BATCH_SIZE ||
		(totalPagesHeader !== null && Number.isSafeInteger(totalPages) && state.page >= totalPages);
	// The cashier's filtered view running out is not the end of the catalogue — it is the
	// handover to the unfiltered stage, in the SAME sort. Filters prioritise; they never
	// exclude a product from ever landing.
	const handsOver = stageExhausted && state.stage === 'window';
	const walkComplete = stageExhausted && !handsOver;
	const completionCensus = walkComplete ? await deps.productCensusTotal() : null;
	// One deficit re-walk per observed total (#1345 mechanism 2d): a record the server
	// permanently omits (id drift, duplicate pos-uuid collapsing two server records
	// into one local doc) keeps localCount < total after EVERY walk. Unbounded, that
	// restarts the whole catalog walk forever — and walkComplete is never recorded, so
	// the changed-total re-arm gate above is never even reached. After one re-walk for
	// a given total, accept completion; the walk re-arms again when the total CHANGES.
	const alreadyRetriedThisTotal =
		completionCensus?.fresh === true && state.observedCensusTotal === completionCensus.total;
	const localCatalogIncomplete =
		completionCensus?.fresh === true &&
		!alreadyRetriedThisTotal &&
		(await deps.database.collections.products.count().exec()) < completionCensus.total;
	const completesWalk = walkComplete && !localCatalogIncomplete;
	const nextState: ProductTrickleState = completesWalk
		? {
				viewKey,
				stage: state.stage,
				page: state.page,
				walkComplete: true,
				observedCensusTotal: completionCensus?.total ?? null,
			}
		: {
				viewKey,
				stage: handsOver ? 'catalog' : state.stage,
				page: handsOver || localCatalogIncomplete ? 1 : state.page + 1,
				walkComplete: false,
				// A deficit restart records the total it is re-walking for; ordinary page
				// advances carry the record forward so the bound survives the walk.
				observedCensusTotal: localCatalogIncomplete
					? (completionCensus?.total ?? null)
					: state.observedCensusTotal,
			};
	await deps.stateStore.set(PRODUCT_TRICKLE_STATE_KEY, JSON.stringify(nextState));
	return ran(payloads.length, state.page, nextState.walkComplete, state.stage);
}
