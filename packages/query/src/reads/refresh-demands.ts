import { remoteIdOrNull } from '@wcpos/sync-core';
import type { RemoteId } from '@wcpos/sync-core';
import type { CoverageOutcome, RxdbSyncEngine } from '@wcpos/sync-engine';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { engineCollection } from '../records/engine-collection';

export async function fetchFreshRecords(
	engine: RxdbSyncEngine,
	requests: readonly {
		id: string;
		collection: 'products' | 'variations' | 'customers' | 'orders';
		wooIds: number[];
	}[]
): Promise<CoverageOutcome[]> {
	const handles = [];
	try {
		for (const request of requests) {
			if (request.wooIds.length === 0) continue;
			handles.push(
				engine.require({
					id: request.id,
					collection: request.collection,
					kind: 'targeted-records',
					remoteIds: request.wooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
					forceRefresh: true,
				})
			);
		}
		return await Promise.all(handles.map((handle) => handle.ready));
	} finally {
		for (const handle of handles) {
			handle.release();
		}
	}
}

type LineItems = import('@wcpos/database').OrderDocument['line_items'];

const stockLogger = getLogger(['wcpos', 'stock-adjustment']);
const parentLogger = getLogger(['wcpos', 'products', 'variation-parent']);

export function refreshStockFor(engine: RxdbSyncEngine, lineItems: LineItems): void {
	if (!Array.isArray(lineItems) || lineItems.length === 0) return;
	const requests = [
		{
			collection: 'products' as const,
			remoteIds: lineItems
				.filter((item) => item.variation_id === 0)
				.map((item) => item.product_id)
				.map(remoteIdOrNull)
				.filter((remoteId) => remoteId !== null),
		},
		{
			collection: 'variations' as const,
			remoteIds: lineItems
				.filter((item) => item.variation_id !== 0)
				.map((item) => item.variation_id)
				.map(remoteIdOrNull)
				.filter((remoteId) => remoteId !== null),
		},
	];

	for (const request of requests) {
		if (request.remoteIds.length === 0) continue;
		const handle = engine.require({
			id: `stock-adjustment:${request.collection}:${request.remoteIds.join(',')}`,
			collection: request.collection,
			kind: 'targeted-records',
			remoteIds: request.remoteIds,
			forceRefresh: true,
		});
		void handle.ready.then(
			() => handle.release(),
			(error) => {
				handle.release();
				// A background re-pull after a sale that already succeeded; the engine
				// wrote the coded row for the failed require (SYNC321) and the stock
				// catches up on the next sync.
				stockLogger.debug('Stock refresh failed', {
					context: {
						collection: request.collection,
						error: getErrorMessage(error),
					},
				});
			}
		);
	}
}

/**
 * The parent of the variation the engine just acknowledged, read from the
 * ACTIVE scope's resident — reported WITH the scope it was read in.
 *
 * The id is read from the resident rather than carried on the event because an
 * acknowledgement can re-materialize the variation from the server's response,
 * and `parent_id` joined the variation schema later than the collection itself
 * — a resident written before that learns its parent exactly here.
 *
 * The scope id travels with it because a product id means nothing on its own
 * here: reading the resident straddles an await, so by the time the caller acts
 * the cashier may have switched stores, and the caller must be able to tell that
 * the id it holds belongs to the scope it is about to fetch into. One resolution
 * of the scope, reported once — the same discipline `use-local-mutation` applies
 * to a barcode edit for the same reason.
 */
async function parentOfAcknowledgedVariation(
	engine: RxdbSyncEngine,
	recordId: string
): Promise<{ parentRemoteId: RemoteId; scopeId: string } | null> {
	const scope = await engine.whenActive();
	const variations = engineCollection(scope.database, 'variations');
	const resident = await variations?.findOne(recordId).exec();
	const payload = (resident?.toJSON() as { payload?: Record<string, unknown> } | undefined)
		?.payload;
	const parentRemoteId = remoteIdOrNull(payload?.parent_id);
	return parentRemoteId === null ? null : { parentRemoteId, scopeId: scope.scopeId };
}

export function watchVariationParentRefresh(engine: RxdbSyncEngine): () => void {
	/** parentRemoteId → an acknowledgement landed while its fetch was in flight. */
	const inFlight = new Map<RemoteId, boolean>();
	let disposed = false;

	const refresh = async (parentRemoteId: RemoteId, scopeId: string): Promise<void> => {
		// The scope the parent id was RESOLVED in. Every path into this function
		// has crossed at least one await — the resident lookup, or a prior fetch
		// before the re-run below — and a store switch landing in that window
		// would otherwise declare the outgoing store's product against the
		// incoming scope, materializing a record that may not be in its catalog.
		if (engine.status().activeScopeId !== scopeId) return;

		if (inFlight.has(parentRemoteId)) {
			// A second child of the same parent was acknowledged after the in-flight
			// fetch was issued, so that response cannot be assumed to include this
			// edit. Re-run once when it settles instead of racing it.
			inFlight.set(parentRemoteId, true);
			return;
		}
		inFlight.set(parentRemoteId, false);

		const handle = engine.require({
			id: `variation-parent:refresh:${parentRemoteId}`,
			collection: 'products',
			kind: 'targeted-records',
			remoteIds: [parentRemoteId],
			// The parent was very likely fetched moments ago — it is the row the
			// edited variation is nested under — so an unforced requirement would be
			// served straight from the dedupe window, with the stale range.
			forceRefresh: true,
		});

		try {
			await handle.ready;
		} catch (error) {
			// Background repair of a derived display value, and the engine already wrote
			// the coded row for the failed require (SYNC321): forensic only.
			parentLogger.debug('Failed to refresh variable product price range', {
				context: { parentId: String(parentRemoteId), error: getErrorMessage(error) },
			});
		} finally {
			handle.release();
		}

		const acknowledgedAgain = inFlight.get(parentRemoteId);
		inFlight.delete(parentRemoteId);
		if (acknowledgedAgain && !disposed) await refresh(parentRemoteId, scopeId);
	};

	const unsubscribe = engine.events((event) => {
		if (event.type !== 'write-acknowledged' && event.type !== 'write-ack-rematerialized') {
			return;
		}
		if (event.collection !== 'variations') return;
		const recordId = event.recordId;
		if (!recordId) return;

		void (async () => {
			const resolved = await parentOfAcknowledgedVariation(engine, recordId);
			if (!resolved || disposed) return;
			await refresh(resolved.parentRemoteId, resolved.scopeId);
		})().catch((error: unknown) => {
			parentLogger.error('Failed to resolve the parent of an acknowledged variation write', {
				code: ERROR_CODES.PRODUCT_UNEXPECTED,
				context: { recordId, error: getErrorMessage(error) },
			});
		});
	});

	return () => {
		disposed = true;
		unsubscribe();
	};
}
