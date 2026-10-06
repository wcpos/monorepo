import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	engineCollectionNameFor,
	type LegacyCollectionName,
} from './engine-adapter/collection-map';
import { legacySearchSnapshot } from './engine-adapter/search-snapshot';
import { observeEngineDatabases } from './engine-query';
import { searchBlobFor } from './search-blob';
import { SEARCH_FIELDS } from './search-fields';

import type { AdapterDatabase, EngineRxDocument } from './engine-adapter/execute-query';
import type { SearchableCollection } from './search-shared';

/**
 * The collections a till searches from its first keystroke: the catalogue on the POS
 * screen. Orders and customers build on first use — their rows are fewer and their
 * screens open later in a shift.
 */
const WARM_COLLECTIONS: readonly LegacyCollectionName[] = ['products', 'variations'];

/**
 * Builds the catalogue search blobs when a database binds, so the first keystroke never
 * waits on the initial projection read (#1733). The blob registry is per collection
 * instance; a later search for the same fields reuses what was warmed here, and the
 * collection's close hook disposes it. A failed read is the blob's own business — it
 * reports through `changes$` to whoever searches and leaves the registry so the next
 * keystroke retries — so nothing is awaited or caught here.
 */
export function warmSearchBlobs(engine: RxdbSyncEngine): () => void {
	const subscription = observeEngineDatabases(engine).subscribe((database) => {
		if (!database) return;
		const adapterDatabase = database as unknown as AdapterDatabase;
		for (const name of WARM_COLLECTIONS) {
			const collection = adapterDatabase.collections[engineCollectionNameFor(name)] as unknown as
				SearchableCollection | undefined;
			if (!collection) continue;
			const blob = searchBlobFor(
				collection,
				SEARCH_FIELDS[name as keyof typeof SEARCH_FIELDS],
				(document: EngineRxDocument) => legacySearchSnapshot(name, document),
				name
			);
			void blob.ready.catch(() => undefined);
		}
	});
	return () => subscription.unsubscribe();
}
