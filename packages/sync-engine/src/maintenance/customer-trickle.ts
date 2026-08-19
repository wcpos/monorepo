/**
 * IDLE CUSTOMER BACKFILL, IN THE CASHIER'S OWN ORDER (#865; re-pointed 2026-08-19).
 *
 * One polite page of customers per idle tick, so a till that has only ever seen the customers
 * it searched for converges on the whole customer base and can look one up offline.
 *
 * Paul's ruling, 2026-08-19 — stated for products, and the same principle for every lane:
 * records arrive in the order the user chose, whatever path they arrive by. The DEMAND path
 * already honoured it (a sorted customers grid declares a browse window in that sort, #951);
 * this lane was the gap, hard-wired to `orderby=id&order=asc` — an order nobody chose.
 *
 * So the walk follows the CUSTOMER BROWSE WINDOW the grid last declared
 * (scheduler/customer-browse-window-descriptor.ts), translated by the same
 * `customerBrowseWindowQueryParams` the drain fetcher uses, and falls back to the default
 * window (id asc) until a grid has declared one.
 *
 * ONE STAGE, unlike the products backfill. A products window carries representable FILTERS,
 * so that lane walks the filtered view first and then the same sort unfiltered — filters
 * prioritise, they never exclude. A customers window is `{limit, orderby, order}` and nothing
 * else: there is no filter to drop, so a second unfiltered stage would be walking the
 * identical query twice. This lane deliberately has no stage.
 *
 * RE-POINTING IS A RESTART, deliberately. The durable cursor is keyed by the window's VIEW
 * identity (the sort, limit-independent), so SCROLLING does not restart the walk but
 * RE-SORTING does — which is exactly what the ruling asks for. Re-downloading a page of
 * already-local customers is the price; `bulkUpsert` absorbs it.
 *
 * The gating is untouched (idle >= 60s, no interactive demand, write-plane owner,
 * pressure-deferred, one request per tick, `manualSync: false`).
 */

import { assertBulkSuccess } from '@wcpos/sync-core';

import { COLLECTION_DESCRIPTORS } from '../collections/collection-descriptors';
import { upsertManifestRows } from '../local-coverage/rx-existence-manifest-repository';
import { manifestRowOf, materializeTargeted } from '../materialization/record-materialization';
import {
	type CensusTotal,
	CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT,
	CUSTOMER_BROWSE_WINDOW_ORDER,
	CUSTOMER_BROWSE_WINDOW_ORDERBY,
	type CustomerBrowseWindowDescriptor,
	customerBrowseWindowQueryParams,
	customerBrowseWindowViewKey,
	parseCustomerBrowseWindowDescriptor,
} from '../scheduler';
import { withoutLocallyProtected } from '../write-path/local-work-guard';

import type { RxDatabase } from 'rxdb';

export const CUSTOMER_TRICKLE_BATCH_SIZE = 10;
export const CUSTOMER_TRICKLE_IDLE_AFTER_MS = 60_000;
export const CUSTOMER_TRICKLE_STATE_KEY = 'customer-trickle:state';

/**
 * The window walked when no grid has declared one this session — the default customers sort,
 * i.e. the same order a cold customers grid mounts in.
 */
const DEFAULT_BROWSE_WINDOW: CustomerBrowseWindowDescriptor = {
	limit: CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT,
	orderby: CUSTOMER_BROWSE_WINDOW_ORDERBY,
	order: CUSTOMER_BROWSE_WINDOW_ORDER,
};

export type CustomerTrickleState = {
	/** The browse window's VIEW identity — the sort, limit-independent. */
	viewKey: string;
	page: number;
	walkComplete: boolean;
	/**
	 * The fresh census total that last triggered a deficit re-walk. A completed walk
	 * re-arms on a deficit only while the total DIFFERS from this — one re-walk per
	 * observed total, so a record the server permanently omits (id drift, duplicate
	 * pos-uuid collapsing two server records into one local doc) cannot re-walk the
	 * directory forever (#1345 mechanism 2d).
	 */
	observedCensusTotal: number | null;
};
export type CustomerTrickleStateStore = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
};

const DEFAULT_STATE: CustomerTrickleState = {
	// No view: any real window mismatches it and restarts the walk. That is also how a cursor
	// persisted by the old id-ascending walk retires itself.
	viewKey: '',
	page: 1,
	walkComplete: false,
	observedCensusTotal: null,
};

export function decodeCustomerTrickleState(raw: string | null): CustomerTrickleState {
	if (raw === null) return { ...DEFAULT_STATE };
	try {
		const parsed = JSON.parse(raw) as Partial<CustomerTrickleState>;
		if (
			!Number.isSafeInteger(parsed.page) ||
			(parsed.page ?? 0) < 1 ||
			typeof parsed.walkComplete !== 'boolean' ||
			typeof parsed.viewKey !== 'string' ||
			(parsed.observedCensusTotal != null &&
				(!Number.isSafeInteger(parsed.observedCensusTotal) || parsed.observedCensusTotal < 0))
		) {
			return { ...DEFAULT_STATE };
		}
		return {
			viewKey: parsed.viewKey,
			page: parsed.page!,
			walkComplete: parsed.walkComplete,
			// Absent on states persisted before #1345 — decode as "no re-walk recorded".
			observedCensusTotal: parsed.observedCensusTotal ?? null,
		};
	} catch {
		return { ...DEFAULT_STATE };
	}
}

export type CustomerTrickleTickResult =
	| {
			status: 'ran';
			rows: number;
			page: number;
			walkComplete: boolean;
			orderby: string;
			order: string;
	  }
	| { status: 'skipped'; reason: 'user-active' | 'interactive-demand' | 'in-flight' }
	| { status: 'idle'; reason: 'walk-complete' };

export type CustomerTrickleDeps = {
	baseUrl: string;
	database: RxDatabase;
	fetcher: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	stateStore: CustomerTrickleStateStore;
	hasPendingWork: () => boolean;
	customerCensusTotal: () => Promise<CensusTotal | null>;
	/**
	 * The lane key of the customers browse window the grid last declared — the cashier's
	 * current sort (`RequirePlane.lastCustomerBrowseQueryKey`). Absent or unparseable falls
	 * back to {@link DEFAULT_BROWSE_WINDOW}.
	 */
	currentBrowseWindowKey?: () => string | null;
	now: () => number;
	lastUserActivityMs?: () => number;
	signal?: AbortSignal;
};

/** The window this tick walks, and the cursor identity that goes with it. */
function resolveBrowseWindow(deps: CustomerTrickleDeps): {
	browseWindow: CustomerBrowseWindowDescriptor;
	viewKey: string;
} {
	const key = deps.currentBrowseWindowKey?.() ?? null;
	const browseWindow =
		(key === null ? null : parseCustomerBrowseWindowDescriptor(key)) ?? DEFAULT_BROWSE_WINDOW;
	return { browseWindow, viewKey: customerBrowseWindowViewKey(browseWindow) };
}

const inFlightDatabases = new WeakSet<RxDatabase>();

export function tickCustomerTrickle(deps: CustomerTrickleDeps): Promise<CustomerTrickleTickResult> {
	if (inFlightDatabases.has(deps.database)) {
		return Promise.resolve({ status: 'skipped', reason: 'in-flight' });
	}
	inFlightDatabases.add(deps.database);
	return runCustomerTrickle(deps).finally(() => {
		inFlightDatabases.delete(deps.database);
	});
}

async function runCustomerTrickle(deps: CustomerTrickleDeps): Promise<CustomerTrickleTickResult> {
	if (
		deps.lastUserActivityMs &&
		deps.now() - deps.lastUserActivityMs() < CUSTOMER_TRICKLE_IDLE_AFTER_MS
	) {
		return { status: 'skipped', reason: 'user-active' };
	}
	if (deps.hasPendingWork()) {
		return { status: 'skipped', reason: 'interactive-demand' };
	}

	const { browseWindow, viewKey } = resolveBrowseWindow(deps);
	const restart: CustomerTrickleState = { ...DEFAULT_STATE, viewKey };
	let state = decodeCustomerTrickleState(await deps.stateStore.get(CUSTOMER_TRICKLE_STATE_KEY));
	// The cashier re-sorted the grid (or this is the first tick since the old id-walk): the
	// order changed, so the walk starts again in the new order.
	if (state.viewKey !== viewKey) state = restart;
	if (state.walkComplete) {
		const census = await deps.customerCensusTotal();
		if (census?.fresh) {
			// Plain count intentionally includes the customer:default sentinel. This can
			// under-trigger re-arming by one, which is accepted for this low-rate lane.
			const localCount = await deps.database.collections.customers.count().exec();
			// Deficit alone is not enough: the total must also have CHANGED since the
			// last deficit re-walk. A permanent deficit (server-omitted id) with an
			// unchanged total otherwise re-walks the whole directory every cadence,
			// forever (#1345 mechanism 2d).
			if (census.total > localCount && census.total !== state.observedCensusTotal) {
				state = { ...restart, observedCensusTotal: census.total };
			} else {
				return { status: 'idle', reason: 'walk-complete' };
			}
		} else {
			return { status: 'idle', reason: 'walk-complete' };
		}
	}

	const query = customerBrowseWindowQueryParams(browseWindow);
	query.set('per_page', String(CUSTOMER_TRICKLE_BATCH_SIZE));
	query.set('page', String(state.page));
	const url = `${deps.baseUrl}/customers?${query.toString()}`;
	const ran = (rows: number, page: number, walkComplete: boolean) =>
		({
			status: 'ran',
			rows,
			page,
			walkComplete,
			orderby: browseWindow.orderby,
			order: browseWindow.order,
		}) as const;
	const response = await deps.fetcher(url, deps.signal ? { signal: deps.signal } : undefined);
	if (!response.ok) {
		if (response.status === 400) {
			const error = (await response.json().catch(() => null)) as { code?: unknown } | null;
			if (error?.code === 'rest_post_invalid_page_number') {
				// Records were deleted under the cursor: rewind THIS view rather than discarding
				// the view identity, which would restart the walk on the next tick anyway but
				// lose the fact that the sort has not changed.
				await deps.stateStore.set(CUSTOMER_TRICKLE_STATE_KEY, JSON.stringify(restart));
				return ran(0, state.page, false);
			}
		}
		throw new Error(`/customers trickle pull failed: HTTP ${response.status}`);
	}
	const descriptor = COLLECTION_DESCRIPTORS.find(
		(candidate) => candidate.collection === 'customers'
	);
	if (!descriptor || descriptor.shape !== 'targeted') {
		throw new Error('Customer trickle requires the targeted customers descriptor');
	}
	const payloads = descriptor.parse((await response.json()) as unknown);
	const documents = payloads.map(
		(payload) => materializeTargeted('customers', payload).storedDocument
	);
	const applicable = await withoutLocallyProtected(
		deps.database.collections.customers as never,
		documents as { uuid: string }[]
	);
	if (applicable.length > 0) {
		assertBulkSuccess(
			await deps.database.collections.customers.bulkUpsert(applicable as never[]),
			'customer-trickle upsert'
		);
	}
	const manifestRows = applicable.flatMap((document) => {
		const row = manifestRowOf(document);
		return row ? [row] : [];
	});
	await upsertManifestRows(
		deps.database.collections.existenceManifestCustomers as never,
		manifestRows
	);

	const totalPagesHeader = response.headers.get('X-WP-TotalPages');
	const totalPages = Number(totalPagesHeader);
	const nextState: CustomerTrickleState =
		payloads.length < CUSTOMER_TRICKLE_BATCH_SIZE ||
		(totalPagesHeader !== null && Number.isSafeInteger(totalPages) && state.page >= totalPages)
			? {
					viewKey,
					page: state.page,
					walkComplete: true,
					observedCensusTotal: state.observedCensusTotal,
				}
			: {
					viewKey,
					page: state.page + 1,
					walkComplete: false,
					observedCensusTotal: state.observedCensusTotal,
				};
	await deps.stateStore.set(CUSTOMER_TRICKLE_STATE_KEY, JSON.stringify(nextState));
	return ran(payloads.length, state.page, nextState.walkComplete);
}
