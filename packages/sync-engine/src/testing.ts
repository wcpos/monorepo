/**
 * `@woo-rxdb-lab/sync-engine-rxdb/testing` — the in-memory adapter kit
 * (ADR 0018). Everything a harness needs to drive the engine through its
 * PUBLIC handle with no real storage, network, or connectivity: memory
 * storage wiring, a memory string store for the checkpoints port, and a
 * scripted connectivity signal. The fake sync servers stay in
 * `@woo-rxdb-lab/sync-core/testing` (they fake the SERVER, not an engine
 * port) — harnesses compose both kits.
 */

import type { RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { EngineConnectivity, EngineStringStore } from './create-rxdb-sync-engine';

// Host schema-canary fixtures. This is deliberately the exact sync-collection
// recipe the engine opens, without exposing package-private descriptors.
export { engineSyncCollectionCreators } from './collections/engine-collections';

// Benchmark-facing production schema fixtures. These are deliberate named
// exports: experiments can compare candidate shapes with the exact schemas
// the engine opens without depending on the package-private `internal` entry.
export { orderSchema, orderMigrationStrategies } from './collections/order-schema';
export { productSchema, productMigrationStrategies } from './collections/product-schema';

/**
 * Memory storage for the engine's `storage` port. Ajv-validated by default so
 * tests catch schema-invalid documents the way the app's dev recipe does;
 * pass `validate: false` for raw speed.
 */
export function memoryEngineStorage(options?: { validate?: boolean }): RxStorage<unknown, unknown> {
  const storage = getRxStorageMemory() as RxStorage<unknown, unknown>;
  if (options?.validate === false) {
    return storage;
  }
  return wrappedValidateAjvStorage({ storage }) as RxStorage<unknown, unknown>;
}

/** In-memory `EngineStringStore` with test-side visibility into the entries. */
export function memoryStringStore(): EngineStringStore & { entries(): ReadonlyMap<string, string> } {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
    entries: () => values,
  };
}

/** Scripted connectivity for the `connectivity` port: `signal` is the port,
 * `set` is the test's hand on the dial. */
export function scriptedConnectivity(initial: EngineConnectivity = 'online'): {
  signal: () => EngineConnectivity;
  set(state: EngineConnectivity): void;
} {
  let state = initial;
  return {
    signal: () => state,
    set: (next) => {
      state = next;
    },
  };
}

// Measurement/simulation surface: explicit lab instruments, scenarios, and fixtures.
export { CHANGE_SIGNAL_STATE_ID, changeSignalStateSchema, type ChangeSignalStateDocument } from './change-signal/change-signal-state-schema';
export { coverageCompactionFailureMigrationStrategies, coverageCompactionFailureSchema, type CoverageCompactionFailureDocument, type CoverageCompactionFailureV0Document } from './local-coverage/coverage-compaction-failure-schema';
export { COVERAGE_COMPACTION_LEASE_KEY, coverageCompactionLeaseMigrationStrategies, coverageCompactionLeaseSchema, type CoverageCompactionLeaseDocument, type CoverageCompactionLeaseV0Document } from './local-coverage/coverage-compaction-lease-schema';
export { coverageLaneMigrationStrategies, coverageLaneSchema, coverageRecordMigrationStrategies, coverageRecordSchema, type CoverageLaneDocument, type CoverageLaneV0Document, type CoverageRecordDocument, type CoverageRecordV0Document } from './local-coverage/coverage-schema';
export { customerSchema, type LocalCustomerDocument } from './collections/customer-schema';
export { EngineOrderRepository } from './write-path/engine-order-repository';
export { primeExistenceManifest, primeExistenceManifestCustomers, primeExistenceManifestOrders, runManifestPrimePass, runSingleLanePrimePass } from './local-coverage/local-coverage';
export { existenceManifestDocument, existenceManifestSchema, type ExistenceManifestDocument } from './local-coverage/existence-manifest-schema';
export { reconcileExistence } from './local-coverage/local-coverage';
export { parseOrderBrowserSchedulerDescriptor } from './scheduler/order-browser-scheduler-descriptor';
export { type LocalOrderDocument } from './collections/order-schema';
export { type LocalProductDocument } from './collections/product-schema';
export { queryTotalCacheMigrationStrategies, queryTotalCacheSchema, type QueryTotalCacheDocument, type QueryTotalCacheV0Document } from './scheduler/query-total-cache-schema';
export { createQueryTotalRequestRunner, mergeQueryTotalCacheEntries } from './scheduler/query-total-request-runner';
export { queryTotalRequestStateMigrationStrategies, queryTotalRequestStateSchema, type QueryTotalRequestStateDocument, type QueryTotalRequestStateV0Document } from './scheduler/query-total-request-state-schema';
export { type ServerDigestEntry } from './reconcile-bucket-plan';
export { brandSchema, type LocalReferenceDocument } from './collections/reference-collection-schema';
export { RxCoverageCompactionLeaseRepository } from './local-coverage/rx-coverage-compaction-lease-repository';
export { runCoverageCompactionMaintenance, type CoverageCompactionFailureStore, type CoverageCompactionMaintenanceRepository, type CoverageCompactionMaintenanceResult } from './local-coverage/local-coverage';
export { createLocalCoverage, type CreateLocalCoverageOptions, type LocalCoverage, type LocalCoveragePrimeResult, type LocalCoverageReconcilePort } from './local-coverage/local-coverage';
export { RxCoverageRepository, coverageLaneKey, coverageRecordKey } from './local-coverage/local-coverage';
export { readManifestRange, removeManifestByWooIds } from './local-coverage/rx-existence-manifest-repository';
export { seedSchedulerTasksFromQueryDeclarations } from './scheduler/rx-query-requirement-scheduler-seeder';
export { RxQueryTotalCacheRepository } from './collections/rx-query-total-cache-repository';
export { RxQueryTotalRequestStateRepository } from './rx-query-total-request-state-repository';
export { runQueryTotalRetryRequests, type QueryTotalRetryRunnerResult } from './rx-query-total-retry-runner';
export { referenceCollectionRepository } from './collections/rx-reference-collection-repository';
export { runPersistedSchedulerTasks, type PersistedSchedulerTaskRunnerResult } from './scheduler/rx-scheduler-task-runner';
export { type SchedulerTaskSeederRepository } from './scheduler/rx-scheduler-task-seeder';
export { RxSchedulerTaskStateRepository } from './scheduler/rx-scheduler-task-state-repository';
export { planCoverageCleanup, type CoverageCleanupAction, type CoverageCleanupDecision } from './scheduler/coverage-cleanup';
export { coverageCleanupScenarios } from './scheduler/coverage-cleanup-scenarios';
export { type CoverageCompactionLease } from './scheduler/coverage-compaction-cadence';
export { coverageCompactionCadenceScenarios, summarizeCoverageCompactionCadenceScenarios, type CoverageCompactionCadenceScenarioSummary } from './scheduler/coverage-compaction-cadence-scenarios';
export { coverageStrategies, runCoverageComparison, type CoverageComparisonResult, type CoverageStrategy } from './scheduler/coverage-model';
export { coverageScenarios } from './scheduler/coverage-scenarios';
export { coverageWriteConflictScenarios, summarizeCoverageWriteConflictScenarios, type CoverageWriteConflictScenarioSummary } from './scheduler/coverage-write-conflict-scenarios';
export { runPersistedCoverageQueryRequirementFlow } from './scheduler/persisted-coverage-query-flow';
export { coverageSchemaIndexes, type PersistedCoverageDocumentSet } from './scheduler/persisted-coverage-schema';
export { persistedCoverageSchemaScenarios, summarizePersistedCoverageSchemaScenarios, type PersistedCoverageSchemaScenarioSummary } from './scheduler/persisted-coverage-schema-scenarios';
export { evaluatePersistedQueryCoverageGate } from './scheduler/persisted-query-coverage-gate';
export { type PersistedSchedulerTaskState } from './scheduler/persisted-scheduler-state';
export { persistedSchedulerStateScenarios, summarizePersistedSchedulerStateScenarios, type PersistedSchedulerStateScenarioSummary } from './scheduler/persisted-scheduler-state-scenarios';
export { type QueryRequirementFlowResult } from './scheduler/query-requirement-library';
export { queryRequirementLibraryScenarios, runQueryRequirementLibraryScenario, summarizeQueryRequirementFlowResult, type QueryRequirementLibraryScenario } from './scheduler/query-requirement-library-scenarios';
export { planQueryTotalDiscovery, type QueryTotalDiscoveryAction } from './scheduler/query-total-discovery';
export { queryTotalDiscoveryScenarios, summarizeQueryTotalDiscoveryScenarios, type QueryTotalDiscoveryScenario, type QueryTotalDiscoveryScenarioSummary } from './scheduler/query-total-discovery-scenarios';
export { type QueryTotalRequestState } from './scheduler/query-total-request-lifecycle';
export { queryTotalRequestLifecycleScenarios, summarizeQueryTotalRequestLifecycleScenarios, type QueryTotalRequestLifecycleScenarioSummary } from './scheduler/query-total-request-lifecycle-scenarios';
export { queryTotalRequestScenarios, summarizeQueryTotalRequestScenarios, type QueryTotalRequestScenarioSummary } from './scheduler/query-total-request-scenarios';
export { type QueryTotalCacheEntry, type QueryTotalWooRequest } from './scheduler/query-total-requests';
export { type FetchTask, type FetchTaskResult, type ReplicationPolicy, type SchedulerRunResult } from './scheduler/replication-policy';
export { runSchedulerScenario, type SchedulerFetcher } from './scheduler/replication-scheduler';
export { summarizeSchedulerCoverageFlowResult, type SchedulerCoverageFlowResult } from './scheduler/scheduler-coverage-flow';
export { runSchedulerCoverageFlowScenario, schedulerCoverageFlowScenarios } from './scheduler/scheduler-coverage-flow-scenarios';
export { schedulerScenarios } from './scheduler/scheduler-scenarios';
export { migrateSchedulerTaskStateV4, schedulerTaskStateKey, schedulerTaskStateMigrationStrategies, schedulerTaskStateSchema, type SchedulerTaskStateDocument, type SchedulerTaskStateV0Document, type SchedulerTaskStateV3Document } from './scheduler/scheduler-task-state-schema';
export { syncCheckpointMigrationStrategies, syncCheckpointSchema, type SyncCheckpointDocument } from './collections/sync-checkpoint-schema';
export { type LocalTaxRateDocument } from './collections/tax-rate-schema';
export { promotedVariationColumns, variationMigrationStrategies, variationSchema, withVariationColumns, type LocalVariationDocument, type StoredVariationDocument, type WooVariationPayload } from './collections/variation-schema';
