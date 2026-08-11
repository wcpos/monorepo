import type { SyncObserver } from '@wcpos/sync-core';

import {
	type CoverageDatabase,
	type LocalLaneCoverageWithExpectedRecords,
	RxCoverageRepository,
} from './persistence';
import {
	type ExistenceManifestPrimeDatabase,
	PRIME_CHUNKS_PER_TICK,
	primeExistenceManifest,
	primeExistenceManifestCustomers,
	primeExistenceManifestOrders,
} from './manifest';
import { reconcileExistence, scanExistenceCandidates } from './reconciliation';
import {
	type CoverageCompactionMaintenanceResult,
	runCoverageCompactionMaintenance,
} from './compaction';
import {
	type CoverageCompactionLeaseDatabase,
	RxCoverageCompactionLeaseRepository,
} from './rx-coverage-compaction-lease-repository';
import {
	type CoverageCompactionFailureDatabase,
	RxCoverageCompactionFailureRepository,
} from './rx-coverage-compaction-failure-repository';
import { registerLedgerRecovery, withLedgerRecovery } from './ledger-storage-recovery';
import {
	DERIVABLE_METADATA_COLLECTIONS,
	resetDerivableMetadataCollection,
} from '../collections/engine-collections';

import type {
	BrowseWindowLaneSnapshot,
	BuildCoverageDocumentsFromQueryResultInput,
	BuildCumulativeCoverageDocumentsFromQueryResultInput,
	LocalRecordCoverage,
	PersistedCoverageDocumentSet,
	QueryCoverageResultRecord,
} from '../scheduler';
import type { ExistenceScanPage, ReconcileSummary } from './reconcile-existence-pass';
import type { ExistenceManifestDocument } from './existence-manifest-schema';
import type { ServerDigestEntry } from '../reconcile-bucket-plan';
import type { RxDatabase } from 'rxdb';

/**
 * Narrow override used by paired marker writes that must establish ordering
 * even when the facade clock is fixed for a scheduler drain tick.
 */
type MarkerPrecedenceOverride = Partial<
	Pick<BuildCoverageDocumentsFromQueryResultInput, 'nowMs' | 'freshForMs'>
>;
type QueryResult = Omit<BuildCoverageDocumentsFromQueryResultInput, 'nowMs' | 'freshForMs'> &
	MarkerPrecedenceOverride;
type CumulativeQueryResult = Omit<
	BuildCumulativeCoverageDocumentsFromQueryResultInput,
	'nowMs' | 'freshForMs'
> &
	MarkerPrecedenceOverride;

export type LocalCoveragePrimeResult = {
	products: number;
	customers: number;
	orders: number;
};
export type ReconcileRequest = {
	signal?: AbortSignal;
	fetcher?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
};

export type LocalCoverageReconcilePort = {
	bucketSize: number;
	occupiedBucketIndexes: () => Promise<readonly number[]>;
	readManifestRange: (lo: number, hi: number) => Promise<ExistenceManifestDocument[]>;
	dirtyWooIds: () => Promise<ReadonlySet<number>>;
	fetchServerScanPage: (
		afterId: number,
		bucketSize: number,
		request?: ReconcileRequest
	) => Promise<ExistenceScanPage>;
	fetchServerBucket: (
		bucket: number,
		bucketSize: number,
		request?: ReconcileRequest
	) => Promise<ServerDigestEntry[]>;
	deleteProducts: (wooIds: number[]) => Promise<void>;
	deleteVariations: (wooIds: number[]) => Promise<void>;
	isAborted?: () => boolean;
};

type LocalCoverageDatabase = CoverageDatabase &
	CoverageCompactionLeaseDatabase &
	CoverageCompactionFailureDatabase;
type LocalCoverageManifestOptions = {
	fetcher: (
		url: string,
		init?: RequestInit
	) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
	syncBaseUrl: string;
	chunkSize?: number;
};
type LocalCoverageBaseOptions = {
	now?: () => number;
	freshForMs: number;
	retainStaleForMs?: number;
	reconcile?: LocalCoverageReconcilePort | LocalCoverageReconcilePort[];
	reconcileCursorStore?: {
		get(key: string): Promise<string | null>;
		set(key: string, value: string): Promise<void>;
	};
	diagnostics?: SyncObserver;
};
export type CreateLocalCoverageOptions = LocalCoverageBaseOptions &
	(
		| { database: LocalCoverageDatabase; manifest?: undefined }
		| {
				database: LocalCoverageDatabase & ExistenceManifestPrimeDatabase;
				manifest: LocalCoverageManifestOptions;
		  }
	);

export interface LocalCoverage {
	recordQueryResult(input: QueryResult): Promise<void>;
	recordCumulativeQueryResult(input: CumulativeQueryResult): Promise<void>;
	recordRecords(input: {
		collection: string;
		queryKey: string;
		records: QueryCoverageResultRecord[];
	}): Promise<void>;
	readSnapshot(): Promise<PersistedCoverageDocumentSet>;
	readRecord(collection: string, id: string): Promise<LocalRecordCoverage | null>;
	readRecords(collection: string, ids: string[]): Promise<LocalRecordCoverage[]>;
	readLane(
		collection: string,
		queryKey: string
	): Promise<LocalLaneCoverageWithExpectedRecords | null>;
	/**
	 * Every lane of one collection. Added for the browse-window eviction sweep (#948/#957
	 * follow-up), which needs to see a view's whole lane family to know which windows a
	 * completed one supersedes.
	 */
	listLanes(collection: string): Promise<BrowseWindowLaneSnapshot[]>;
	/**
	 * Delete a lane whose ids a larger lane has absorbed — compare-and-delete against the
	 * stored revision, so a walk that rewrites the lane between plan and delete cannot lose
	 * coverage. `supersededAtMs` is the superseding lane's `updatedAtMs`: a lane rewritten
	 * after it is not stale and survives. The one targeted removal on this facade; everything
	 * else reclaims by expiry through {@link LocalCoverage.compact}.
	 */
	removeLaneIfContained(input: {
		collection: string;
		queryKey: string;
		containedIn: readonly string[];
		supersededAtMs: number;
	}): Promise<boolean>;
	compact(): Promise<number>;
	maintainCompaction(input: {
		ownerId: string;
		intervalMs: number;
		minExpiredDocuments: number;
		lastCompactedAtMs: number | null;
		leaseTtlMs: number;
		failureBackoffMs: number;
	}): Promise<CoverageCompactionMaintenanceResult>;
	primeManifest(manifest?: LocalCoverageManifestOptions): Promise<LocalCoveragePrimeResult>;
	reconcilePass(
		signal?: AbortSignal,
		fetcher?: ReconcileRequest['fetcher'],
		shouldDefer?: () => boolean
	): Promise<ReconcileSummary>;
}

const emptyReconcileSummary = (): ReconcileSummary => ({
	buckets: 0,
	emptyBuckets: 0,
	pruned: 0,
	missing: 0,
	changed: 0,
	skippedDirty: 0,
});

export const DRILL_DOWNS_PER_TICK = 2;
/**
 * Scan aggregate pages per id-space per audit tick. The pager skips gaps between occupied
 * buckets, so 3 pages cover ~150 OCCUPIED buckets (~150k held ids) per space — beyond any
 * design-envelope store. Occupied buckets past the budget fall through as drill candidates
 * (bounded by DRILL_DOWNS_PER_TICK + cursor), so coverage degrades to a slow sweep, never
 * a blind spot. Registry bound: 3 spaces x SCAN_PAGES_PER_SPACE + DRILL_DOWNS_PER_TICK.
 */
export const SCAN_PAGES_PER_SPACE = 3;
export const EXISTENCE_RECONCILE_CURSOR_KEY = 'existence-reconcile:cursor';
type ReconcileCursor = { nextPort: number; afterBuckets: number[] };

function decodeReconcileCursor(raw: string | null, portCount: number): ReconcileCursor {
	try {
		const parsed = JSON.parse(raw ?? '') as Partial<ReconcileCursor>;
		if (
			!Number.isSafeInteger(parsed.nextPort) ||
			(parsed.nextPort ?? -1) < 0 ||
			(parsed.nextPort ?? 0) >= portCount ||
			!Array.isArray(parsed.afterBuckets) ||
			parsed.afterBuckets.length !== portCount ||
			parsed.afterBuckets.some((bucket) => !Number.isSafeInteger(bucket) || bucket < -1)
		) {
			throw new Error('invalid cursor');
		}
		return { nextPort: parsed.nextPort!, afterBuckets: parsed.afterBuckets };
	} catch {
		return {
			nextPort: 0,
			afterBuckets: Array.from({ length: portCount }, () => -1),
		};
	}
}

function selectDrillDowns(candidates: readonly number[][], cursor: ReconcileCursor) {
	const selected: { port: number; bucket: number }[] = [];
	const next = {
		nextPort: cursor.nextPort,
		afterBuckets: [...cursor.afterBuckets],
	};
	while (selected.length < DRILL_DOWNS_PER_TICK) {
		let found = false;
		for (let offset = 0; offset < candidates.length; offset += 1) {
			const port = (next.nextPort + offset) % candidates.length;
			const bucket = candidates[port]!.find((value) => value > next.afterBuckets[port]!);
			if (bucket === undefined) continue;
			selected.push({ port, bucket });
			next.afterBuckets[port] = bucket;
			next.nextPort = (port + 1) % candidates.length;
			found = true;
			break;
		}
		if (!found) break;
	}
	if (
		candidates.every((values, port) => values.every((value) => value <= next.afterBuckets[port]!))
	) {
		next.afterBuckets.fill(-1);
	}
	return { selected, next };
}

export function createLocalCoverage(options: CreateLocalCoverageOptions): LocalCoverage {
	const database = options.database as unknown as RxDatabase;
	const now = options.now ?? Date.now;
	const observe = (event: Parameters<SyncObserver>[0]) => {
		try {
			options.diagnostics?.(event);
		} catch {
			/* telemetry never breaks coverage */
		}
	};
	// The ledger is one unit of three collections, but two repository families read
	// it. Coverage owns the drop/recreate recipe and the observer, so it registers
	// them for the database; the scheduler seed/drain sites trigger the same rebuild
	// through the registry (#956).
	registerLedgerRecovery({
		database,
		rebuild: async (reason, trigger) => {
			for (const name of DERIVABLE_METADATA_COLLECTIONS) {
				await resetDerivableMetadataCollection(database, name);
			}
			observe({
				type: 'coverage.ledger-rebuilt',
				level: 'warn',
				fields: { reason, trigger },
			});
		},
	});
	const repository = withLedgerRecovery({
		database,
		create: () => new RxCoverageRepository(options.database),
	});
	let inMemoryReconcileCursor: string | null = null;

	return {
		recordQueryResult: (input) =>
			repository.recordQueryResult({
				...input,
				nowMs: input.nowMs ?? now(),
				freshForMs: input.freshForMs ?? options.freshForMs,
			}),
		recordCumulativeQueryResult: (input) =>
			repository.recordCumulativeQueryResult({
				...input,
				nowMs: input.nowMs ?? now(),
				freshForMs: input.freshForMs ?? options.freshForMs,
			}),
		recordRecords: (input) =>
			repository.recordRecords({
				...input,
				nowMs: now(),
				freshForMs: options.freshForMs,
			}),
		readSnapshot: () => repository.readCoverageDocuments(),
		readRecord: (collection, id) => repository.readLocalRecordCoverage(collection, id, now()),
		readRecords: (collection, ids) => repository.readLocalRecordCoverages(collection, ids, now()),
		readLane: (collection, queryKey) =>
			repository.readLocalLaneCoverage(collection, queryKey, now()),
		listLanes: async (collection) =>
			(await repository.listCoverageLanesForCollection(collection)).map((lane) => ({
				queryKey: lane.queryKey,
				complete: lane.complete,
				expectedRecordIds: lane.expectedRecordIds,
				updatedAtMs: lane.updatedAtMs,
			})),
		removeLaneIfContained: (input) => repository.removeCoverageLaneIfContained(input),
		compact: async () => {
			const result = await repository.compactRetention({
				nowMs: now(),
				retainStaleForMs: options.retainStaleForMs ?? 0,
			});
			observe({
				type: 'coverage.compacted',
				level: 'info',
				fields: { removed: result.removed.length },
			});
			return result.removed.length;
		},
		maintainCompaction: (input) =>
			runCoverageCompactionMaintenance({
				repository,
				leaseStore: new RxCoverageCompactionLeaseRepository(options.database),
				failureStore: new RxCoverageCompactionFailureRepository(options.database),
				tabId: input.ownerId,
				nowMs: now(),
				intervalMs: input.intervalMs,
				retainStaleForMs: options.retainStaleForMs ?? 0,
				minExpiredDocuments: input.minExpiredDocuments,
				lastCompactedAtMs: input.lastCompactedAtMs,
				leaseTtlMs: input.leaseTtlMs,
				failureBackoffMs: input.failureBackoffMs,
			}),
		primeManifest: async (manifestOverride) => {
			const manifest = manifestOverride ?? options.manifest;
			if (!manifest) return { products: 0, customers: 0, orders: 0 };
			const database = options.database as LocalCoverageDatabase & ExistenceManifestPrimeDatabase;
			const chunkBudget = { remaining: PRIME_CHUNKS_PER_TICK };
			const products = await primeExistenceManifest(database, {
				...manifest,
				chunkBudget,
			});
			const customers = await primeExistenceManifestCustomers(database, {
				...manifest,
				chunkBudget,
			});
			const orders = await primeExistenceManifestOrders(database, {
				...manifest,
				chunkBudget,
			});
			return { products, customers, orders };
		},
		reconcilePass: async (signal, fetcher, shouldDefer) => {
			if (!options.reconcile) return emptyReconcileSummary();
			const ports = Array.isArray(options.reconcile) ? options.reconcile : [options.reconcile];
			const request =
				signal !== undefined || fetcher !== undefined ? { signal, fetcher } : undefined;
			const deps = ports.map((port) => ({
				...port,
				fetchServerScanPage: (afterId: number, bucketSize: number) =>
					port.fetchServerScanPage(afterId, bucketSize, request),
				fetchServerBucket: (bucket: number, bucketSize: number) =>
					port.fetchServerBucket(bucket, bucketSize, request),
				isAborted: () => signal?.aborted === true || port.isAborted?.() === true,
				shouldDefer,
				maxScanPages: SCAN_PAGES_PER_SPACE,
			}));
			const scans = await Promise.allSettled(deps.map(scanExistenceCandidates));
			const scanFailures = scans.flatMap((result) =>
				result.status === 'rejected' ? [result.reason] : []
			);
			if (scanFailures.length > 0) {
				const details = scanFailures
					.map((failure) => (failure instanceof Error ? failure.message : String(failure)))
					.join('; ');
				throw new AggregateError(
					scanFailures,
					`Existence scan failed in ${scanFailures.length} id space(s): ${details}`
				);
			}
			const candidates = scans.map((result) =>
				result.status === 'fulfilled' ? result.value.candidates : []
			);
			const rawCursor = options.reconcileCursorStore
				? await options.reconcileCursorStore.get(EXISTENCE_RECONCILE_CURSOR_KEY)
				: inMemoryReconcileCursor;
			const selection = selectDrillDowns(
				candidates,
				decodeReconcileCursor(rawCursor, ports.length)
			);
			const encodedCursor = JSON.stringify(selection.next);
			if (options.reconcileCursorStore) {
				await options.reconcileCursorStore.set(EXISTENCE_RECONCILE_CURSOR_KEY, encodedCursor);
			} else {
				inMemoryReconcileCursor = encodedCursor;
			}
			const selectedByPort = ports.map((_port, index) =>
				selection.selected.filter(({ port }) => port === index).map(({ bucket }) => bucket)
			);
			const settled = await Promise.allSettled(
				deps.map((port, index) =>
					selectedByPort[index]!.length === 0
						? emptyReconcileSummary()
						: reconcileExistence({ ...port, buckets: selectedByPort[index] })
				)
			);
			const summary = settled.reduce<ReconcileSummary>(
				(total, result) =>
					result.status === 'fulfilled'
						? {
								buckets: total.buckets + result.value.buckets,
								emptyBuckets: total.emptyBuckets + result.value.emptyBuckets,
								pruned: total.pruned + result.value.pruned,
								missing: total.missing + result.value.missing,
								changed: total.changed + result.value.changed,
								skippedDirty: total.skippedDirty + result.value.skippedDirty,
								...(total.deferred || result.value.deferred ? { deferred: true as const } : {}),
							}
						: total,
				{
					...emptyReconcileSummary(),
					emptyBuckets: scans.reduce(
						(total, result) =>
							total + (result.status === 'fulfilled' ? result.value.emptyBuckets : 0),
						0
					),
				}
			);
			const failures = settled.flatMap((result) =>
				result.status === 'rejected' ? [result.reason] : []
			);
			if (failures.length > 0) {
				if (signal?.aborted) {
					throw failures[0];
				}
				const details = failures
					.map((failure) => (failure instanceof Error ? failure.message : String(failure)))
					.join('; ');
				throw new AggregateError(
					failures,
					`Existence reconcile failed in ${failures.length} id space(s) after all passes settled; completed ${summary.buckets} buckets: ${details}`
				);
			}
			return summary;
		},
	};
}

// Test instruments stay reachable through the one LocalCoverage module door.
export {
	primeExistenceManifest,
	primeExistenceManifestCustomers,
	primeExistenceManifestOrders,
	runManifestPrimePass,
	runSingleLanePrimePass,
} from './manifest';
export { reconcileExistence } from './reconciliation';
export {
	runCoverageCompactionMaintenance,
	type CoverageCompactionFailureStore,
	type CoverageCompactionMaintenanceRepository,
	type CoverageCompactionMaintenanceResult,
} from './compaction';
export { RxCoverageRepository, coverageLaneKey, coverageRecordKey } from './persistence';
