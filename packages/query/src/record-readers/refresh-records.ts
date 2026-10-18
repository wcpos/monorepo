import type { RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

/** Own a forced collection refresh until it settles, including failure. */
export async function refreshCollection(
	engine: RxdbSyncEngine,
	request: { id: string; collection: SyncCollectionName }
): Promise<void> {
	const handle = engine.require({ ...request, kind: 'refresh', forceRefresh: true });
	try {
		await handle.ready;
	} finally {
		handle.release();
	}
}
