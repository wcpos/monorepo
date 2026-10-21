import { remoteIdOrNull } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

// Upper bound on the post-payment local refresh. The cart and receipt are
// already routed by then; this only decides how long a queued-but-stalled
// require may hold its handle before it is released. 10 s covers a slow store
// round-trip without keeping a handle open across a whole cashier shift.
export const ORDER_REFRESH_TIMEOUT_MS = 10_000;

/**
 * Best-effort local catch-up after a payment: pull the paid order so the
 * cart/receipt reflect the server's status. Bounded, because a require's
 * `ready` is not guaranteed to settle (a queued plane, dirty-row protection,
 * coalescing) and nothing the cashier is waiting on may depend on it — callers
 * route to the receipt BEFORE calling this (#1685). Resolves after the refresh
 * or the bound, whichever is first; rejects only if `ready` rejects first.
 */
export async function refreshOrderBounded(
	engine: Pick<RxdbSyncEngine, 'require'>,
	orderId: number
): Promise<void> {
	const handle = engine.require({
		id: `checkout:order-refresh:${orderId}`,
		collection: 'orders',
		kind: 'targeted-records',
		remoteIds: [orderId].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
		forceRefresh: true,
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			handle.ready,
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, ORDER_REFRESH_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
		handle.release();
	}
}
