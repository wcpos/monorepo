import type { SyncObserver } from '@wcpos/sync-core';

import {
	type CoverageDatabase,
	type LocalLaneCoverageWithExpectedRecords,
	RxCoverageRepository,
} from './persistence';
import {
	type ExistenceManifestPrimeDatabase,
	primeExistenceManifest,
	primeExistenceManifestCustomers,
	primeExistenceManifestOrders,
} from './manifest';
import { reconcileExistence } from './reconciliation';
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

import type { PersistedCoverageDocumentSet } from '../scheduler/persisted-coverage-schema';
import type { LocalRecordCoverage } from '../scheduler/coverage-model';
import type {
	BuildCoverageDocumentsFromQueryResultInput,
	BuildCumulativeCoverageDocumentsFromQueryResultInput,
	QueryCoverageResultRecord,
} from '../scheduler/query-coverage-writes';
import type { ReconcileSummary } from './reconcile-existence-pass';
import type { ExistenceManifestDocument } from './existence-manifest-schema';
import type { ServerDigestEntry } from '../reconcile-bucket-plan';

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

export type LocalCoveragePrimeResult = { products: number; customers: number; orders: number };
export type ReconcileRequest = {
	signal?: AbortSignal;
	fetcher?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
};

export type LocalCoverageReconcilePort = {
	bucketSize: number;
	maxWooId: () => Promise<number>;
	readManifestRange: (lo: number, hi: number) => Promise<ExistenceManifestDocument[]>;
	dirtyWooIds: () => Promise<ReadonlySet<number>>;
	fetchServerBucket: (
		bucket: number,
		bucketSize: number,
		request?: ReconcileRequest
	) => Promise<ServerDigestEntry[]>;
	deleteProducts: (wooIds: number[]) => Promise<void>;
	deleteVariations: (wooIds: number[]) => Promise<void>;
	pullProducts: (wooIds: number[], request?: ReconcileRequest) => Promise<void>;
	pullVariations: (wooIds: number[], request?: ReconcileRequest) => Promise<void>;
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
		fetcher?: ReconcileRequest['fetcher']
	): Promise<ReconcileSummary>;
}

const emptyReconcileSummary = (): ReconcileSummary => ({
	buckets: 0,
	pruned: 0,
	pulled: 0,
	repulled: 0,
	skippedDirty: 0,
});

export function createLocalCoverage(options: CreateLocalCoverageOptions): LocalCoverage {
	const repository = new RxCoverageRepository(options.database);
	const now = options.now ?? Date.now;
	const observe = (event: Parameters<SyncObserver>[0]) => {
		try {
			options.diagnostics?.(event);
		} catch {
			/* telemetry never breaks coverage */
		}
	};

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
			repository.recordRecords({ ...input, nowMs: now(), freshForMs: options.freshForMs }),
		readSnapshot: () => repository.readCoverageDocuments(),
		readRecord: (collection, id) => repository.readLocalRecordCoverage(collection, id, now()),
		readRecords: (collection, ids) => repository.readLocalRecordCoverages(collection, ids, now()),
		readLane: (collection, queryKey) =>
			repository.readLocalLaneCoverage(collection, queryKey, now()),
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
			const [products, customers, orders] = await Promise.all([
				primeExistenceManifest(
					options.database as LocalCoverageDatabase & ExistenceManifestPrimeDatabase,
					manifest
				),
				primeExistenceManifestCustomers(
					options.database as LocalCoverageDatabase & ExistenceManifestPrimeDatabase,
					manifest
				),
				primeExistenceManifestOrders(
					options.database as LocalCoverageDatabase & ExistenceManifestPrimeDatabase,
					manifest
				),
			]);
			return { products, customers, orders };
		},
		reconcilePass: async (signal, fetcher) => {
			if (!options.reconcile) return emptyReconcileSummary();
			const ports = Array.isArray(options.reconcile) ? options.reconcile : [options.reconcile];
			const request =
				signal !== undefined || fetcher !== undefined ? { signal, fetcher } : undefined;
			const settled = await Promise.allSettled(
				ports.map((port) =>
					reconcileExistence({
						...port,
						fetchServerBucket: (bucket, bucketSize) =>
							port.fetchServerBucket(bucket, bucketSize, request),
						pullProducts: (wooIds) =>
							request ? port.pullProducts(wooIds, request) : port.pullProducts(wooIds),
						pullVariations: (wooIds) =>
							request ? port.pullVariations(wooIds, request) : port.pullVariations(wooIds),
						isAborted: () => signal?.aborted === true || port.isAborted?.() === true,
					})
				)
			);
			const summary = settled.reduce<ReconcileSummary>(
				(total, result) =>
					result.status === 'fulfilled'
						? {
								buckets: total.buckets + result.value.buckets,
								pruned: total.pruned + result.value.pruned,
								pulled: total.pulled + result.value.pulled,
								repulled: total.repulled + result.value.repulled,
								skippedDirty: total.skippedDirty + result.value.skippedDirty,
							}
						: total,
				emptyReconcileSummary()
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
