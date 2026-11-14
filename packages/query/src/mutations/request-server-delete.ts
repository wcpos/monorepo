import type { RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

interface ServerDeleteIntent {
	collection: SyncCollectionName;
	recordId: string;
}

/**
 * The ONE sanctioned entry to `operation: 'delete'` from the UI layer (#1093).
 *
 * A delete written to the engine is a DURABLE, SERVER-BOUND DELETE of a live
 * record — it survives restarts and drains to a wc/v3 DELETE request. Every
 * caller must be a deliberate, user-confirmed destructive action.
 *
 * Local cache eviction is NOT a delete. It rides the engine's guarded reset
 * funnel (`useCollectionReset` / `scope.resetCollection`), which refuses to
 * destroy a pending mutation queue and never touches the server. Confusing
 * the two is how #1093 happened; a lint rule now bans raw
 * `operation: 'delete'` literals in screens outside this module.
 */
export function requestServerDelete(
	engine: Pick<RxdbSyncEngine, 'write'>,
	{ collection, recordId }: ServerDeleteIntent
) {
	return engine.write({ collection, operation: 'delete', recordId });
}
