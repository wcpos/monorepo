import { orderDocumentFromWooPayload } from '../scheduler';

/**
 * One targeted, read-only fetch of an order's CURRENT server revision (the
 * 428-recovery seam). Shared by the drain's `refreshRevision` port and the
 * facade's resolveConflict refresh-first retry on a 'needs-revision' row —
 * both must observe the same server truth the same way. Returns null when the
 * server no longer returns the record; throws on a transport/HTTP failure.
 */
export async function fetchOrderServerRevision(input: {
	fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	syncBaseUrl: string;
	wooOrderId: number;
}): Promise<string | null> {
	// No `dp` — see the monetary-precision note in rx-scheduler-order-fetcher (#946). This
	// read is the sharpest case: it exists ONLY to adopt the server's stamped revision, so a
	// `dp`-shifted payload here would hand the drain a hash the push side can never match.
	const response = await input.fetch(
		`${input.syncBaseUrl}/orders?include=${input.wooOrderId}&per_page=1&orderby=include`
	);
	if (!response.ok) throw new Error(`revision refresh failed: HTTP ${response.status}`);
	const [payload] = (await response.json()) as Record<string, unknown>[];
	if (!payload) return null;
	return orderDocumentFromWooPayload(payload as never).sync.revision || null;
}
