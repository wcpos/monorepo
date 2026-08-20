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

import { useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';

import type { RxCollection } from 'rxdb';

const templatesLogger = getLogger(['wcpos', 'query', 'templates']);

/** In-flight de-dupe so concurrent `templates` queries share one fetch. */
const inFlight = new WeakMap<RxCollection, Promise<void>>();

/**
 * Fetch the full templates set and upsert it into the local collection.
 * Best-effort: a network/parse failure is logged, never thrown into render.
 */
export function syncTemplates(
	collection: RxCollection,
	httpClient: {
		get(url: string, config: { params: { posts_per_page: number } }): Promise<{ data?: unknown }>;
	}
): Promise<void> {
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
			// parseRestResponse coerces ONE document — handed the whole array it
			// returns it untouched, so unpruned server extras reach bulkUpsert and
			// schema validation rejects every row. Parse per row.
			const parse = (collection as any)?.parseRestResponse;
			const rows = await Promise.all(
				data.map((row: Record<string, unknown>) =>
					typeof parse === 'function' ? parse.call(collection, row) : row
				)
			);
			if (rows.length > 0) {
				const result = await collection.bulkUpsert(rows);
				// bulkUpsert reports per-document failures in its result instead of
				// throwing — surface them, or a rejected set is indistinguishable
				// from an empty store (the receipt modal just shows no templates).
				const errors = result.error;
				if (errors.length > 0) {
					templatesLogger.error('Templates upsert rejected documents', {
						code: ERROR_CODES.PRINT_UNEXPECTED,
						context: {
							rejected: errors.length,
							total: rows.length,
							rejectedDocuments: errors.map((rejection) => ({
								documentId: rejection.documentId,
								status: rejection.status,
								validationErrors: rejection.status === 422 ? rejection.validationErrors : undefined,
							})),
						},
					});
				}
			}
		} catch (error: any) {
			templatesLogger.error('Failed to sync templates', {
				code: ERROR_CODES.PRINT_UNEXPECTED,
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
	const runtime = useQueryRuntime();
	const httpClient = useRestHttpClient();
	const collection = runtime.localDB.collections.templates;
	React.useEffect(() => {
		if (collection) void syncTemplates(collection, httpClient);
	}, [collection, httpClient]);
}
