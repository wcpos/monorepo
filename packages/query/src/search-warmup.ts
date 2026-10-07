import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	engineCollectionNameFor,
	type LegacyCollectionName,
} from './engine-adapter/collection-map';
import { legacySearchSnapshot } from './engine-adapter/search-snapshot';
import { observeEngineDatabases } from './engine-query';
import { searchBlobFor } from './search-blob';
import { type SearchFieldCollection, searchFieldsFor } from './search-fields';

import type { AdapterDatabase, EngineRxDocument } from './engine-adapter/execute-query';
import type { SearchableCollection } from './search-shared';

/**
 * The collections a till searches from its first keystroke: the catalogue on the POS
 * screen. They go first and alone, so their initial read never competes with the rest.
 */
const TILL_COLLECTIONS = [
	'products',
	'variations',
] as const satisfies readonly SearchFieldCollection[];

/**
 * Everything else a cashier searches, warmed once the till pair has reported ready (an
 * event, not a guess). Customers are on the checkout path — a cashier adding a customer
 * to the cart expects them findable exactly as a product is (#1733) — so they lead.
 */
const SECONDARY_COLLECTIONS = [
	'customers',
	'orders',
	'products/categories',
	'products/tags',
	'products/brands',
	'coupons',
] as const satisfies readonly SearchFieldCollection[];

/**
 * Upper bound on the till pair's exclusive head start, so a stalled catalogue read never
 * holds customers back indefinitely. 10 s is far past any measured catalogue read and
 * well inside a shift's first customer lookup.
 */
const TILL_HEAD_START_CAP_MS = 10_000;

/** Builds (or finds) the blob for one collection; `null` when the database lacks it. */
function warm(database: AdapterDatabase, name: SearchFieldCollection) {
	const collection = database.collections[engineCollectionNameFor(name)] as unknown as
		SearchableCollection | undefined;
	if (!collection) return null;
	return searchBlobFor(
		collection,
		searchFieldsFor(name) ?? [],
		(document: EngineRxDocument) => legacySearchSnapshot(name as LegacyCollectionName, document),
		name
	);
}

/**
 * Builds the search blobs when a database binds, so the first keystroke never waits on
 * the initial projection read (#1733). The blob registry is per collection instance and
 * field list; a later search for the same fields (`searchFieldsFor` reads the same table)
 * reuses what was warmed here, and the collection's close hook disposes it. A failed read
 * is the blob's own business — it reports through `changes$` to whoever searches and
 * leaves the registry so the next keystroke retries — so nothing here awaits a result.
 */
export function warmSearchBlobs(
	engine: RxdbSyncEngine,
	timings: { tillHeadStartCapMs: number } = { tillHeadStartCapMs: TILL_HEAD_START_CAP_MS }
): () => void {
	let current: AdapterDatabase | null = null;
	let disposed = false;
	const subscription = observeEngineDatabases(engine).subscribe((database) => {
		const adapterDatabase = (database as unknown as AdapterDatabase | null) ?? null;
		current = adapterDatabase;
		if (!adapterDatabase) return;
		const till = TILL_COLLECTIONS.map((name) => warm(adapterDatabase, name));
		const tillReady = Promise.allSettled(till.map((blob) => blob?.ready));
		const cap = new Promise<void>((resolve) => setTimeout(resolve, timings.tillHeadStartCapMs));
		void Promise.race([tillReady, cap]).then(() => {
			// A store switch during the head start must not warm the OLD scope's collections.
			if (disposed || current !== adapterDatabase) return;
			for (const name of SECONDARY_COLLECTIONS) warm(adapterDatabase, name);
		});
	});
	return () => {
		disposed = true;
		subscription.unsubscribe();
	};
}
