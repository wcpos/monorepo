/**
 * The dedicated `templates` path (ADR 0025 carve-out).
 *
 * `templates` has no engine collection: the WP endpoint returns the full receipt
 * set in a single response (`posts_per_page=-1`, ignores include/exclude), and
 * Core consumes it read-only from the local RxDB collection
 * (`storeDB.templates.find(...)`). So instead of the old replication machine we
 * do the smaller-correct thing: one direct fetch through the transitional http
 * seam that upserts the set into the local `templates` collection. The fluent
 * `useQuery({collectionName:'templates'})` then reads that local collection
 * directly (the same local read path as `logs`).
 *
 * @deprecated increment-3 — folds into the engine once templates gains a facet.
 */

import { getLogger } from '@wcpos/utils/logger';

import type { RxCollection } from 'rxdb';

const templatesLogger = getLogger(['wcpos', 'query', 'templates']);

/** In-flight de-dupe so concurrent `templates` queries share one fetch. */
const inFlight = new WeakMap<RxCollection, Promise<void>>();

/**
 * Fetch the full templates set and upsert it into the local collection.
 * Best-effort: a network/parse failure is logged, never thrown into render.
 */
export function syncTemplates(collection: RxCollection, httpClient: any): Promise<void> {
	if (!collection || !httpClient) {
		return Promise.resolve();
	}
	const existing = inFlight.get(collection);
	if (existing) {
		return existing;
	}
	const run = (async () => {
		try {
			const response = await httpClient.get('templates', {
				params: { posts_per_page: -1 },
			});
			const data = response?.data;
			if (!Array.isArray(data)) {
				return;
			}
			const parse = (collection as any)?.parseRestResponse;
			const parsed = typeof parse === 'function' ? await parse.call(collection, data) : data;
			const rows = Array.isArray(parsed) ? parsed : [parsed];
			if (rows.length > 0) {
				await (collection as any).bulkUpsert(rows);
			}
		} catch (error: any) {
			templatesLogger.error('Failed to sync templates', {
				context: { error: error?.message },
			});
		} finally {
			inFlight.delete(collection);
		}
	})();
	inFlight.set(collection, run);
	return run;
}
