import type { SchedulerTaskStateDatabase } from './rx-scheduler-task-state-repository';

/**
 * The scope handle the persisted-scheduler seeders need (slice 5c): just a
 * way to reach the scope's database carrying the scheduler-task collection.
 * Structural on purpose — the web host's RxOrderRepository (whose
 * getDatabase() returns the full LabDatabase) and the engine's own scope
 * handles both satisfy it, so the seeders run identically under the
 * pre-adoption web assembly and inside the engine loops.
 */
export type SchedulerScopeHandle = { getDatabase(): SchedulerTaskStateDatabase };

/**
 * Resolves the ACTIVE scope at call time. In the web host this is a thin
 * binding over getRxOrderRepository() (the exclusive-ownership resolver
 * frames live there — a host concern, not an engine one); engine callers
 * bind their own scope registry.
 */
export type SchedulerScopeResolver = () => Promise<SchedulerScopeHandle>;
