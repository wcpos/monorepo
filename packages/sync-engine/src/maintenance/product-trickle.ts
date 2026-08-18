import { assertBulkSuccess } from '@wcpos/sync-core';

import { COLLECTION_DESCRIPTORS } from '../collections/collection-descriptors';
import { upsertManifestRows } from '../local-coverage/rx-existence-manifest-repository';
import {
	barcodeSelectorsFor,
	type BarcodeSelectorsReader,
} from '../materialization/barcode-selectors';
import { manifestRowOf, materializeTargeted } from '../materialization/record-materialization';
import { withoutLocallyProtected } from '../write-path/local-work-guard';

import type { CensusTotal } from '../scheduler';
import type { RxDatabase } from 'rxdb';

export const PRODUCT_TRICKLE_BATCH_SIZE = 10;
export const PRODUCT_TRICKLE_IDLE_AFTER_MS = 60_000;
export const PRODUCT_TRICKLE_STATE_KEY = 'product-trickle:state';

export type ProductTrickleState = {
	page: number;
	walkComplete: boolean;
	observedCensusTotal: number | null;
};
export type ProductTrickleStateStore = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
};
const DEFAULT_STATE: ProductTrickleState = {
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
			(parsed.observedCensusTotal !== null &&
				(!Number.isSafeInteger(parsed.observedCensusTotal) ||
					(parsed.observedCensusTotal ?? -1) < 0))
		) {
			return { ...DEFAULT_STATE };
		}
		return {
			page: parsed.page!,
			walkComplete: parsed.walkComplete,
			observedCensusTotal: parsed.observedCensusTotal ?? null,
		};
	} catch {
		return { ...DEFAULT_STATE };
	}
}
export type ProductTrickleTickResult =
	| { status: 'ran'; rows: number; page: number; walkComplete: boolean }
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
	now: () => number;
	lastUserActivityMs?: () => number;
	signal?: AbortSignal;
};
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

	let state = decodeProductTrickleState(await deps.stateStore.get(PRODUCT_TRICKLE_STATE_KEY));
	if (state.walkComplete) {
		const census = await deps.productCensusTotal();
		if (census?.fresh && census.total !== state.observedCensusTotal) {
			state = { ...DEFAULT_STATE };
		} else {
			return { status: 'idle', reason: 'walk-complete' };
		}
	}

	const url = `${deps.baseUrl}/products?status=publish&orderby=id&order=asc&per_page=${PRODUCT_TRICKLE_BATCH_SIZE}&page=${state.page}`;
	const response = await deps.fetcher(url, deps.signal ? { signal: deps.signal } : undefined);
	if (!response.ok) {
		if (response.status === 400) {
			const error = (await response.json().catch(() => null)) as { code?: unknown } | null;
			if (error?.code === 'rest_post_invalid_page_number') {
				await deps.stateStore.set(PRODUCT_TRICKLE_STATE_KEY, JSON.stringify(DEFAULT_STATE));
				return { status: 'ran', rows: 0, page: state.page, walkComplete: false };
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
	const documents = payloads.map(
		(payload) => materializeTargeted('products', payload, selectors).storedDocument
	);
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
	const manifestRows = applicable.flatMap((document) => {
		const row = manifestRowOf(document);
		return row ? [row] : [];
	});
	await upsertManifestRows(deps.database.collections.existenceManifest as never, manifestRows);

	const totalPagesHeader = response.headers.get('X-WP-TotalPages');
	const totalPages = Number(totalPagesHeader);
	const walkComplete =
		payloads.length < PRODUCT_TRICKLE_BATCH_SIZE ||
		(totalPagesHeader !== null && Number.isSafeInteger(totalPages) && state.page >= totalPages);
	const completionCensus = walkComplete ? await deps.productCensusTotal() : null;
	const nextState: ProductTrickleState = walkComplete
		? {
				page: state.page,
				walkComplete: true,
				observedCensusTotal: completionCensus?.total ?? null,
			}
		: { page: state.page + 1, walkComplete: false, observedCensusTotal: null };
	await deps.stateStore.set(PRODUCT_TRICKLE_STATE_KEY, JSON.stringify(nextState));
	return {
		status: 'ran',
		rows: payloads.length,
		page: state.page,
		walkComplete: nextState.walkComplete,
	};
}
