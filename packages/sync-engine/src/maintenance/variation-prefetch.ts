import { remoteIdOrNull, type SyncObserver, wooIdOf } from '@wcpos/sync-core';

import {
	COLLECTION_DESCRIPTORS,
	type TargetedDescriptor,
} from '../collections/collection-descriptors';
import { type HandlerContext, pullTargetedByIds } from '../change-signal/change-signal-handlers';
import { hasPendingLocalWork } from '../write-path/local-work-guard';

import type { BarcodeSelectorsReader } from '../materialization/barcode-selectors';
import type { CensusTotal } from '../scheduler';
import type { RxDatabase } from 'rxdb';
export const VARIATION_PREFETCH_BATCH_SIZE = 10;
export const VARIATION_PREFETCH_IDLE_AFTER_MS = 60_000;
export const VARIATION_PREFETCH_STATE_KEY = 'variation-prefetch:state';
export const VARIATION_PREFETCH_PARENT_SCAN_LIMIT = 25;
export type VariationPrefetchState = {
	cursorWooId: number;
	walkComplete: boolean;
	observedCensusTotal: number | null;
	observedParentFingerprint: string | null;
	activeParentWooId: number | null;
	attemptedVariationIds: number[];
};
export type VariationPrefetchStateStore = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
};
const DEFAULT_STATE: VariationPrefetchState = {
	cursorWooId: 0,
	walkComplete: false,
	observedCensusTotal: null,
	observedParentFingerprint: null,
	activeParentWooId: null,
	attemptedVariationIds: [],
};

export function decodeVariationPrefetchState(raw: string | null): VariationPrefetchState {
	if (raw === null) return { ...DEFAULT_STATE };
	try {
		const parsed = JSON.parse(raw) as Partial<VariationPrefetchState>;
		if (
			!Number.isSafeInteger(parsed.cursorWooId) ||
			(parsed.cursorWooId ?? -1) < 0 ||
			typeof parsed.walkComplete !== 'boolean' ||
			(parsed.observedCensusTotal !== null &&
				(!Number.isSafeInteger(parsed.observedCensusTotal) ||
					(parsed.observedCensusTotal ?? -1) < 0)) ||
			(parsed.observedParentFingerprint !== null &&
				typeof parsed.observedParentFingerprint !== 'string') ||
			(parsed.activeParentWooId !== null &&
				(!Number.isSafeInteger(parsed.activeParentWooId) || (parsed.activeParentWooId ?? 0) < 1)) ||
			!Array.isArray(parsed.attemptedVariationIds) ||
			parsed.attemptedVariationIds.some(
				(id) => !Number.isSafeInteger(id) || typeof id !== 'number' || id < 1
			)
		) {
			return { ...DEFAULT_STATE };
		}
		return {
			cursorWooId: parsed.cursorWooId!,
			walkComplete: parsed.walkComplete,
			observedCensusTotal: parsed.observedCensusTotal!,
			observedParentFingerprint: parsed.observedParentFingerprint!,
			activeParentWooId: parsed.activeParentWooId!,
			attemptedVariationIds: parsed.attemptedVariationIds,
		};
	} catch {
		return { ...DEFAULT_STATE };
	}
}

export type VariationPrefetchTickResult =
	| {
			status: 'ran';
			parentWooId: number | null;
			requestedIds: number;
			walkComplete: boolean;
	  }
	| {
			status: 'skipped';
			reason: 'user-active' | 'interactive-demand' | 'in-flight';
	  }
	| { status: 'idle'; reason: 'walk-complete' };

export type VariationPrefetchDeps = {
	database: RxDatabase;
	fetcher: HandlerContext['fetch'];
	syncBaseUrl: string;
	diagnostics: SyncObserver;
	pullBatchSize?: HandlerContext['pullBatchSize'];
	barcodeSelectors?: BarcodeSelectorsReader;
	stateStore: VariationPrefetchStateStore;
	hasPendingWork: () => boolean;
	variationCensusTotal: () => Promise<CensusTotal | null>;
	now: () => number;
	lastUserActivityMs?: () => number;
	signal?: AbortSignal;
};
const inFlightDatabases = new WeakSet<RxDatabase>();
export function tickVariationPrefetch(
	deps: VariationPrefetchDeps
): Promise<VariationPrefetchTickResult> {
	if (inFlightDatabases.has(deps.database)) {
		return Promise.resolve({ status: 'skipped', reason: 'in-flight' });
	}
	inFlightDatabases.add(deps.database);
	return runVariationPrefetch(deps).finally(() => inFlightDatabases.delete(deps.database));
}
function descriptorFor(collection: 'products' | 'variations'): TargetedDescriptor {
	const descriptor = COLLECTION_DESCRIPTORS.find(
		(candidate): candidate is TargetedDescriptor =>
			candidate.shape === 'targeted' && candidate.collection === collection
	);
	if (!descriptor)
		throw new Error(`Variation prefetch requires the targeted ${collection} descriptor`);
	return descriptor;
}
async function missingVariationIds(
	database: RxDatabase,
	descriptor: TargetedDescriptor,
	ids: number[]
): Promise<number[]> {
	const remoteIds = ids.map(remoteIdOrNull).filter((id) => id !== null);
	const docs = await database.collections[descriptor.collection]
		.find({
			selector: { [descriptor.wooIdField]: { $in: remoteIds } } as never,
		})
		.exec();
	const present = new Set(
		docs
			.map((doc) => remoteIdOrNull(doc.toJSON()[descriptor.wooIdField]))
			.filter((id) => id !== null)
	);
	return ids.filter((id) => !present.has(remoteIdOrNull(id)!));
}
async function residentVariableParentFingerprint(
	database: RxDatabase,
	descriptor: TargetedDescriptor
): Promise<string> {
	const docs = await database.collections[descriptor.collection]
		.find({ selector: { type: 'variable' } })
		.exec();
	const parentSignatures = docs
		.flatMap((doc) => {
			const json = doc.toJSON() as Record<string, unknown> & {
				payload?: Record<string, unknown>;
			};
			const parentId = remoteIdOrNull(json[descriptor.wooIdField] ?? json.payload?.id);
			if (parentId === null) return [];
			const rawVariationIds = json.payload?.variations;
			const variationIds = Array.isArray(rawVariationIds)
				? rawVariationIds
						.filter(
							(id): id is number => Number.isSafeInteger(id) && typeof id === 'number' && id > 0
						)
						.sort((left, right) => left - right)
				: [];
			return [`${parentId}:${variationIds.join(',')}`];
		})
		.sort()
		.join('|');
	let fingerprint = 0xcbf29ce484222325n;
	for (let index = 0; index < parentSignatures.length; index += 1) {
		fingerprint ^= BigInt(parentSignatures.charCodeAt(index));
		fingerprint = BigInt.asUintN(64, fingerprint * 0x100000001b3n);
	}
	return fingerprint.toString(36).padStart(13, '0');
}
function throwIfAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) return;
	if (signal.reason instanceof Error) throw signal.reason;
	throw Object.assign(new Error('Variation prefetch aborted'), {
		name: 'AbortError',
	});
}
async function runVariationPrefetch(
	deps: VariationPrefetchDeps
): Promise<VariationPrefetchTickResult> {
	if (
		deps.lastUserActivityMs &&
		deps.now() - deps.lastUserActivityMs() < VARIATION_PREFETCH_IDLE_AFTER_MS
	) {
		return { status: 'skipped', reason: 'user-active' };
	}
	if (deps.hasPendingWork()) return { status: 'skipped', reason: 'interactive-demand' };

	const productsDescriptor = descriptorFor('products');
	const variationsDescriptor = descriptorFor('variations');
	let state = decodeVariationPrefetchState(await deps.stateStore.get(VARIATION_PREFETCH_STATE_KEY));
	throwIfAborted(deps.signal);
	if (state.walkComplete) {
		const [census, parentFingerprint] = await Promise.all([
			deps.variationCensusTotal(),
			residentVariableParentFingerprint(deps.database, productsDescriptor),
		]);
		throwIfAborted(deps.signal);
		// The census is a change signal, not a coverage proof: permanently omitted
		// server ids must not re-arm this walk forever.
		if (
			parentFingerprint !== state.observedParentFingerprint ||
			(census?.fresh && census.total !== state.observedCensusTotal)
		) {
			state = { ...DEFAULT_STATE };
		} else {
			return { status: 'idle', reason: 'walk-complete' };
		}
	}
	if (state.observedCensusTotal === null || state.observedParentFingerprint === null) {
		const [census, parentFingerprint] = await Promise.all([
			deps.variationCensusTotal(),
			residentVariableParentFingerprint(deps.database, productsDescriptor),
		]);
		throwIfAborted(deps.signal);
		state = {
			...state,
			observedCensusTotal: state.observedCensusTotal ?? census?.total ?? null,
			observedParentFingerprint: state.observedParentFingerprint ?? parentFingerprint,
		};
	}

	const parentDocs = await deps.database.collections[productsDescriptor.collection]
		.find({ selector: { type: 'variable' } })
		.exec();
	throwIfAborted(deps.signal);
	const parents = parentDocs
		.flatMap((doc) => {
			const json = doc.toJSON() as Record<string, unknown> & {
				payload?: Record<string, unknown>;
			};
			const remoteId = remoteIdOrNull(json[productsDescriptor.wooIdField] ?? json.payload?.id);
			return remoteId === null ? [] : [{ json, wooId: wooIdOf(remoteId) }];
		})
		.filter((parent) => parent.wooId > state.cursorWooId)
		.sort((left, right) => left.wooId - right.wooId);
	const scanned = parents.slice(0, VARIATION_PREFETCH_PARENT_SCAN_LIMIT);
	let cursorWooId = state.cursorWooId;
	let deferredParent = false;
	for (const parent of scanned) {
		throwIfAborted(deps.signal);
		const previousCursorWooId = cursorWooId;
		if (hasPendingLocalWork(parent.json)) {
			deferredParent = true;
			break;
		}
		cursorWooId = parent.wooId;
		const rawIds = parent.json.payload?.variations;
		const variationIds = Array.isArray(rawIds)
			? rawIds.filter(
					(id): id is number => Number.isSafeInteger(id) && typeof id === 'number' && id > 0
				)
			: [];
		const missing = await missingVariationIds(deps.database, variationsDescriptor, variationIds);
		throwIfAborted(deps.signal);
		const attempted = new Set(
			state.activeParentWooId === parent.wooId ? state.attemptedVariationIds : []
		);
		const unattempted = missing.filter((id) => !attempted.has(id));
		if (unattempted.length === 0) {
			state = { ...state, activeParentWooId: null, attemptedVariationIds: [] };
			continue;
		}
		const requested = unattempted.slice(0, VARIATION_PREFETCH_BATCH_SIZE);
		if (
			deps.lastUserActivityMs &&
			deps.now() - deps.lastUserActivityMs() < VARIATION_PREFETCH_IDLE_AFTER_MS
		) {
			return { status: 'skipped', reason: 'user-active' };
		}
		if (deps.hasPendingWork()) return { status: 'skipped', reason: 'interactive-demand' };
		throwIfAborted(deps.signal);
		const ctx: HandlerContext = {
			database: deps.database,
			fetch: deps.fetcher,
			syncBaseUrl: deps.syncBaseUrl,
			persistState: async () => undefined,
			log: (line) =>
				deps.diagnostics({
					type: 'coverage.require.log',
					level: 'debug',
					message: line,
				}),
			observe: deps.diagnostics,
			...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
			...(deps.barcodeSelectors !== undefined ? { barcodeSelectors: deps.barcodeSelectors } : {}),
		};
		await pullTargetedByIds(ctx, variationsDescriptor, requested);
		throwIfAborted(deps.signal);
		// A server-omitted id gets one attempt per walk; only a partial parent batch
		// holds the cursor for the next tick.
		const parentIncomplete = unattempted.length > VARIATION_PREFETCH_BATCH_SIZE;
		const nextState = {
			...state,
			cursorWooId: parentIncomplete ? previousCursorWooId : parent.wooId,
			walkComplete: false,
			activeParentWooId: parentIncomplete ? parent.wooId : null,
			attemptedVariationIds: parentIncomplete ? [...attempted, ...requested] : [],
		};
		await deps.stateStore.set(VARIATION_PREFETCH_STATE_KEY, JSON.stringify(nextState));
		return {
			status: 'ran',
			parentWooId: parent.wooId,
			requestedIds: requested.length,
			walkComplete: false,
		};
	}
	const walkComplete = !deferredParent && parents.length <= VARIATION_PREFETCH_PARENT_SCAN_LIMIT;
	const nextState: VariationPrefetchState = {
		cursorWooId,
		walkComplete,
		observedCensusTotal: state.observedCensusTotal,
		observedParentFingerprint: state.observedParentFingerprint,
		activeParentWooId: state.activeParentWooId,
		attemptedVariationIds: state.attemptedVariationIds,
	};
	await deps.stateStore.set(VARIATION_PREFETCH_STATE_KEY, JSON.stringify(nextState));
	return {
		status: 'ran',
		parentWooId: scanned.at(-1)?.wooId ?? null,
		requestedIds: 0,
		walkComplete,
	};
}
