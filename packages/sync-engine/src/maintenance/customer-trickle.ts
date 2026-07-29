import { assertBulkSuccess } from '@wcpos/sync-core';

import { COLLECTION_DESCRIPTORS } from '../collections/collection-descriptors';
import { upsertManifestRows } from '../local-coverage/rx-existence-manifest-repository';
import { manifestRowOf, materializeTargeted } from '../materialization/record-materialization';
import { withoutLocallyProtected } from '../write-path/local-work-guard';

import type { CensusTotal } from '../scheduler/census';
import type { RxDatabase } from 'rxdb';

export const CUSTOMER_TRICKLE_BATCH_SIZE = 10;
export const CUSTOMER_TRICKLE_IDLE_AFTER_MS = 60_000;
const CUSTOMER_TRICKLE_STATE_KEY = 'customer-trickle:state';

export type CustomerTrickleState = { page: number; walkComplete: boolean };
export type CustomerTrickleStateStore = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
};

const DEFAULT_STATE: CustomerTrickleState = { page: 1, walkComplete: false };

export function decodeCustomerTrickleState(raw: string | null): CustomerTrickleState {
	if (raw === null) return { ...DEFAULT_STATE };
	try {
		const parsed = JSON.parse(raw) as Partial<CustomerTrickleState>;
		if (
			!Number.isSafeInteger(parsed.page) ||
			(parsed.page ?? 0) < 1 ||
			typeof parsed.walkComplete !== 'boolean'
		) {
			return { ...DEFAULT_STATE };
		}
		return { page: parsed.page!, walkComplete: parsed.walkComplete };
	} catch {
		return { ...DEFAULT_STATE };
	}
}

export type CustomerTrickleTickResult =
	| { status: 'ran'; rows: number; page: number; walkComplete: boolean }
	| { status: 'skipped'; reason: 'user-active' | 'interactive-demand' }
	| { status: 'idle'; reason: 'walk-complete' };

export type CustomerTrickleDeps = {
	baseUrl: string;
	database: RxDatabase;
	fetcher: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	stateStore: CustomerTrickleStateStore;
	hasPendingWork: () => boolean;
	customerCensusTotal: () => Promise<CensusTotal | null>;
	now: () => number;
	lastUserActivityMs?: () => number;
	signal?: AbortSignal;
};

export async function tickCustomerTrickle(
	deps: CustomerTrickleDeps
): Promise<CustomerTrickleTickResult> {
	if (
		deps.lastUserActivityMs &&
		deps.now() - deps.lastUserActivityMs() < CUSTOMER_TRICKLE_IDLE_AFTER_MS
	) {
		return { status: 'skipped', reason: 'user-active' };
	}
	if (deps.hasPendingWork()) {
		return { status: 'skipped', reason: 'interactive-demand' };
	}

	let state = decodeCustomerTrickleState(await deps.stateStore.get(CUSTOMER_TRICKLE_STATE_KEY));
	if (state.walkComplete) {
		const census = await deps.customerCensusTotal();
		if (census?.fresh) {
			// Plain count intentionally includes the customer:default sentinel. This can
			// under-trigger re-arming by one, which is accepted for this low-rate lane.
			const localCount = await deps.database.collections.customers.count().exec();
			if (census.total > localCount) {
				state = { ...DEFAULT_STATE };
			} else {
				return { status: 'idle', reason: 'walk-complete' };
			}
		} else {
			return { status: 'idle', reason: 'walk-complete' };
		}
	}

	const url = `${deps.baseUrl}/customers?orderby=id&order=asc&per_page=${CUSTOMER_TRICKLE_BATCH_SIZE}&page=${state.page}`;
	const response = await deps.fetcher(url, deps.signal ? { signal: deps.signal } : undefined);
	if (!response.ok) {
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
		documents as { id: string }[]
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

	const nextState =
		payloads.length < CUSTOMER_TRICKLE_BATCH_SIZE
			? { page: state.page, walkComplete: true }
			: { page: state.page + 1, walkComplete: false };
	await deps.stateStore.set(CUSTOMER_TRICKLE_STATE_KEY, JSON.stringify(nextState));
	return {
		status: 'ran',
		rows: payloads.length,
		page: state.page,
		walkComplete: nextState.walkComplete,
	};
}
