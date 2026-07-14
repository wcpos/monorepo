/**
 * @wcpos/sync-engine — the RxDB-bound replication engine.
 *
 * TWO DOORS ONLY (ADR 0018, executed 2026-07-10 — #467): this module and
 * `./testing` are the package's entire surface; `packageExports.test.ts`
 * pins it. Everything else in src/ is implementation, free to move or die.
 *
 *  - `.` (here): `createRxdbSyncEngine` — the one runtime value — plus the
 *    type-only interface hosts program against (engine types, document/config
 *    types). New consumers use the handle, never internals.
 *  - `./testing` (src/testing.ts): the measurement surface — in-memory ports,
 *    real schema fixtures, and the pure simulation models the lab's
 *    experiment panels run. The port checklist's "Measurement kit and
 *    transitional plumbing" consumer list is the current truth: production-
 *    bound web plumbing still imports this door pending re-homing.
 */

// The facade (ADR 0018): the handle and its types.
export {
	createRxdbSyncEngine,
	type ActiveScope,
	type EngineConnectivity,
	type EngineEvent,
	type EngineFetcher,
	type EngineHostTransport,
	type EngineStatus,
	type EngineScopeEvent,
	type EngineStats,
	type EngineStringStore,
	type ResettableCollectionName,
	type CoverageOutcome,
	type EngineConflict,
	type EngineLane,
	type EngineRequirement,
	type RxdbSyncEngine,
	type RxdbSyncEnginePorts,
	type RequirementHandle,
	type SyncReport,
	type WriteIntent,
	type StoreScopeIdentity,
	type SyncCollectionName,
	type Unsubscribe,
} from './create-rxdb-sync-engine';

// Facade configuration and reporting types.
export type {
	EngineIntervals,
	MaintenanceLaneName,
	MaintenanceLaneReport,
	QueryTotalPort,
	QueryTotalCacheEvent,
} from './create-rxdb-sync-engine';

// The scheduler-monitor read seam (slice 5f): hosts LIVE-READ the persisted
// task queue straight off the active scope database —
// `engine.active().database.collections.schedulerTaskStates` — the engine
// deliberately adds no bespoke query API over what RxDB already provides.
// This type names the rows that collection holds.
// Public interface types used by host runtime plumbing. No runtime values are exposed here.
export type { ChangeSignalStateDocument } from './change-signal/change-signal-state-schema';
export type { CoverageCompactionFailureDocument } from './local-coverage/coverage-compaction-failure-schema';
export type { CoverageCompactionLeaseDocument } from './local-coverage/coverage-compaction-lease-schema';
export type {
	CoverageLaneDocument,
	CoverageRecordDocument,
} from './local-coverage/coverage-schema';
export type { LocalCustomerDocument } from './collections/customer-schema';
export type { ExistenceManifestDocument } from './local-coverage/existence-manifest-schema';
export type { LocalOrderDocument } from './collections/order-schema';
export type { LocalProductDocument } from './collections/product-schema';
export type { QueryTotalCacheDocument } from './scheduler/query-total-cache-schema';
export type { QueryTotalRequestStateDocument } from './scheduler/query-total-request-state-schema';
export type { LocalReferenceDocument } from './collections/reference-collection-schema';
export type { SchedulerTaskStateDocument } from './scheduler/scheduler-task-state-schema';
export type { CoverageStrategy } from './scheduler/coverage-model';
export type { QueryCoverageResultRecord } from './scheduler/query-coverage-writes';
export type { QueryRequirementDeclaration } from './scheduler/query-requirement-library';
export type { QueryTotalCacheEntry, QueryTotalWooRequest } from './scheduler/query-total-requests';
export type {
	ConnectivityMode,
	ReplicationPolicy,
	ReplicationRequirementKind,
} from './scheduler/replication-policy';
export type { SyncCheckpointDocument } from './collections/sync-checkpoint-schema';
export type { LocalTaxRateDocument } from './collections/tax-rate-schema';
export type {
	LocalVariationDocument,
	StoredVariationDocument,
	WooVariationPayload,
} from './collections/variation-schema';
