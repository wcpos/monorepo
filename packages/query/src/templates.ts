/**
 * The dedicated `templates` path (ADR 0025 carve-out).
 *
 * `templates` has no engine collection: the WP endpoint returns the full receipt
 * set in a single response (`posts_per_page=-1`, ignores include/exclude), and
 * Core consumes it read-only from the local RxDB collection
 * (`storeDB.templates.find(...)`). One direct fetch through the HTTP seam
 * upserts the set into the local `templates` collection, which core reads directly.
 */

import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { useQueryManager } from './provider';

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

/** Keep the dedicated local templates collection fresh without creating a query manager. */
export function useTemplatesSync(): void {
	const runtime = useQueryManager();
	const collection = runtime.localDB.collections.templates;
	React.useEffect(() => {
		if (collection) void syncTemplates(collection, runtime.httpClient);
	}, [collection, runtime.httpClient]);
}
