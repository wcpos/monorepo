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

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { isAsleepBlock, requestStateManager } from '@wcpos/hooks/use-http-client';
import { useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';

import type { RxCollection } from 'rxdb';

const templatesLogger = getLogger(['wcpos', 'query', 'templates']);

/** In-flight de-dupe so concurrent `templates` queries share one fetch. */
const inFlight = new WeakMap<RxCollection, Map<string, Promise<void>>>();

/**
 * Collections whose sync was blocked by the sleeping pre-flight check. `useTemplatesSync`
 * consumes this on wake so only a genuinely deferred sync re-runs — this hook lives for
 * the whole session, and re-fetching on every wake would pull the full template set
 * (`posts_per_page=-1`) on every tab switch or window restore.
 */
const deferredCollections = new WeakMap<RxCollection, Set<string>>();

/**
 * Fetch the full templates set and upsert it into the local collection.
 * Best-effort: a network/parse failure is logged, never thrown into render.
 */
export function syncTemplates(
	collection: RxCollection,
	httpClient: {
		get(
			url: string,
			config: { params: { posts_per_page: number; type?: string; store_id?: number } }
		): Promise<{ data?: unknown }>;
	},
	type: 'receipt' | 'report' | 'closure' = 'receipt',
	storeId?: number
): Promise<void> {
	if (!collection || !httpClient) {
		return Promise.resolve();
	}
	const key = `${type}:${storeId ?? ''}`;
	const runs = inFlight.get(collection) ?? new Map<string, Promise<void>>();
	inFlight.set(collection, runs);
	const existing = runs.get(key);
	if (existing) {
		return existing;
	}
	const run = (async () => {
		try {
			const response = await httpClient.get('templates', {
				params: {
					posts_per_page: -1,
					...(type !== 'receipt' ? { type } : {}),
					...(storeId != null && storeId !== 0 ? { store_id: storeId } : {}),
				},
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
				data.map((row: Record<string, unknown>, index) => {
					// The API array carries the resolved global/store display order;
					// post menu_order does not. Preserve it for the local sorted query.
					const orderedRow = {
						...row,
						menu_order: index,
						...(type === 'closure'
							? { uuid: `${storeId ?? 0}:${row.uuid}`, closure_store_id: storeId ?? 0 }
							: {}),
					};
					return typeof parse === 'function' ? parse.call(collection, orderedRow) : orderedRow;
				})
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
			if (type === 'closure') {
				const ids = new Set(rows.map((row) => row.uuid));
				const previous = await collection
					.find({ selector: { type, closure_store_id: storeId ?? 0 } })
					.exec();
				await Promise.all(previous.filter((row) => !ids.has(row.uuid)).map((row) => row.remove()));
			}
		} catch (error: any) {
			if (isAsleepBlock(error)) {
				// Blocked before the request left, so the template set is untouched, not
				// broken. Mark it so the next wake re-runs this one.
				const deferred = deferredCollections.get(collection) ?? new Set<string>();
				deferred.add(key);
				deferredCollections.set(collection, deferred);
				templatesLogger.debug('Templates sync deferred — app is in background');
			} else {
				const logLevel = isExpectedPreflightBlock(error) ? 'warn' : 'error';
				templatesLogger[logLevel]('Failed to sync templates', {
					code: ERROR_CODES.PRINT_UNEXPECTED,
					context: { error: error?.message },
				});
			}
		} finally {
			runs.delete(key);
		}
	})();
	runs.set(key, run);
	return run;
}

/** Keep the dedicated local templates collection fresh without creating a query manager. */
export function useTemplatesSync(
	type: 'receipt' | 'report' | 'closure' = 'receipt',
	storeId?: number
): void {
	const runtime = useQueryRuntime();
	const httpClient = useRestHttpClient();
	const collection = runtime.localDB.collections.templates;
	const key = `${type}:${storeId ?? ''}`;

	// A sync deferred while the window was hidden re-runs on wake — otherwise the
	// receipt modal shows no templates until the next remount. Only a deferred sync
	// re-runs; a routine wake must not re-pull the whole set.
	const [wakeTick, setWakeTick] = React.useState(0);
	React.useEffect(
		() =>
			requestStateManager.onWake(() => {
				if (!collection || !deferredCollections.get(collection)?.has(key)) return;
				deferredCollections.get(collection)?.delete(key);
				setWakeTick((tick) => tick + 1);
			}),
		[collection, key]
	);

	React.useEffect(() => {
		if (collection) void syncTemplates(collection, httpClient, type, storeId);
	}, [collection, httpClient, wakeTick, type, storeId]);
}
