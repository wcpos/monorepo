import { mintRemoteId, remoteIdOrNull } from '@wcpos/sync-core';
import type { RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

import { fetchFreshRecords } from '../reads/refresh-demands';

/** Demand referenced records without forcing a refresh; the caller owns the lifetime. */
export function demandRecordsByWooId(
	engine: RxdbSyncEngine,
	request: {
		id: string;
		collection: 'products' | 'variations' | 'customers' | 'orders';
		wooIds: readonly number[];
	}
): { ready: Promise<'settled' | 'released'>; release(): void } {
	if (request.wooIds.length === 0) {
		return { ready: Promise.resolve('settled'), release: () => undefined };
	}
	const handle = engine.require({
		id: request.id,
		collection: request.collection,
		kind: 'targeted-records',
		remoteIds: request.wooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
	});
	return {
		ready: handle.ready.then((outcome) =>
			outcome?.action === 'released' ? 'released' : 'settled'
		),
		release: () => handle.release(),
	};
}

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

/**
 * Force a single remote record refresh and release its demand when settled. Resolves whether
 * the store's copy is now resident: the engine applied the row (a write, or an unchanged row
 * confirmed without one), and not kept the local row back for its pending work.
 */
export async function refreshRecordByWooId(
	engine: RxdbSyncEngine,
	request: {
		id: string;
		collection: 'products' | 'variations' | 'customers' | 'orders';
		wooId: number;
	}
): Promise<boolean> {
	const [outcome] = await fetchFreshRecords(engine, [
		{ id: request.id, collection: request.collection, wooIds: [request.wooId] },
	]);
	// Applied ids are the engine's remote ids as strings (`String(document.remoteId)`).
	return (
		outcome?.action === 'fetched' &&
		(outcome.appliedRecordIds ?? []).includes(String(request.wooId))
	);
}

/** Force an order's refunds refresh, preserving release outcomes for the caller's loop. */
export async function refreshOrderRefunds(
	engine: RxdbSyncEngine,
	request: { id: string; orderId: number }
): Promise<'settled' | 'released'> {
	const handle = engine.require({
		id: request.id,
		kind: 'refunds-by-parent',
		collection: 'refunds',
		parentRemoteId: mintRemoteId(request.orderId, 'refund parent'),
		forceRefresh: true,
	});
	try {
		const result = await handle.ready;
		return result?.action === 'released' ? 'released' : 'settled';
	} finally {
		handle.release();
	}
}

// Bound the post-payment wait so a stalled refresh cannot strand checkout.
export const ORDER_REFRESH_TIMEOUT_MS = 10_000;

/**
 * Pull the store's copy of one order and wait for it, bounded.
 *
 * Used after a payment the store accepted: whatever the till holds locally is behind,
 * and the store's copy is the one with the money on it.
 */
export function refreshOrderRecord(
	engine: RxdbSyncEngine,
	orderId: number
): Promise<'refreshed' | 'timed-out' | 'failed'> {
	// Deliberately not `async`: an engine that cannot even take the request throws
	// from here, synchronously, to whoever asked for the refresh. Only the WAIT for
	// readiness is the caller's to absorb.
	const handle = engine.require({
		id: `checkout:order-refresh:${orderId}`,
		collection: 'orders',
		kind: 'targeted-records',
		remoteIds: [orderId].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
		forceRefresh: true,
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		handle.ready.then((result): 'refreshed' | 'failed' =>
			result.action === 'fetched' && result.appliedRecordIds?.includes(String(orderId))
				? 'refreshed'
				: 'failed'
		),
		new Promise<'timed-out'>((resolve) => {
			timer = setTimeout(() => resolve('timed-out'), ORDER_REFRESH_TIMEOUT_MS);
		}),
	]).finally(() => {
		if (timer) clearTimeout(timer);
		handle.release();
	});
}

/** Refresh rejected stock best-effort, releasing each admitted demand independently. */
export function refreshStockRecords(
	engine: RxdbSyncEngine,
	{
		id: orderId,
		productIds,
		variationIds,
	}: { id: number | undefined; productIds: number[]; variationIds: number[] }
): Promise<void> {
	const refreshes: Promise<void>[] = [];
	for (const [collection, wooIds] of [
		['products', productIds],
		['variations', variationIds],
	] as const) {
		if (wooIds.length === 0) continue;
		let handle: ReturnType<RxdbSyncEngine['require']>;
		try {
			handle = engine.require({
				id: `checkout:stock-rejection:${collection}:${orderId}`,
				collection,
				kind: 'targeted-records',
				remoteIds: wooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
				forceRefresh: true,
			});
		} catch {
			// Admission is best-effort too; keep waiting on any other admitted collection.
			continue;
		}
		refreshes.push(
			handle.ready
				.then(
					() => undefined,
					() => undefined
				)
				.finally(() => handle.release())
		);
	}
	return Promise.all(refreshes).then(() => undefined);
}
