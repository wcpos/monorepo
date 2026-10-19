import type { ConflictResolutionChoice, RxdbSyncEngine } from '@wcpos/sync-engine';

/** Resolve a parked queue row using the engine's existing resolution semantics. */
export function resolveQueuedChange(
	engine: Pick<RxdbSyncEngine, 'resolveConflict'>,
	mutationId: string,
	resolution: ConflictResolutionChoice
): Promise<void> {
	return engine.resolveConflict(mutationId, resolution);
}
