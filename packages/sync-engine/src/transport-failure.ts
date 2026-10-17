import { RequestTimeoutError } from './write-path/request-timeout';

/**
 * Errors the engine's own transport threw: the fetch itself rejected (DNS, a
 * refused connection, a dropped socket). The host fetcher already wrote a
 * `transport.request` row for each, so a lane that fails on one is reporting
 * the same incident a second time. A WeakSet rather than a wrapper type, so
 * callers that check `error.name` or `instanceof TypeError` see the original.
 */
const transportThrown = new WeakSet<object>();

/** Record that `error` came out of the transport (see `transportThrown`). */
export function markTransportFailure(error: unknown): void {
	if (typeof error === 'object' && error !== null) transportThrown.add(error);
}

/**
 * The request status a lane or requirement failure came from: the HTTP status,
 * or 0 for a request that got no response (a deadline or a thrown fetch).
 * Undefined when the failure was local — a storage write, a parse, a bug.
 *
 * The cashier log reads it to decide who reports the incident: a failed
 * request already has its own transport or deadline row, so the lane row about
 * it stays quiet. A 2xx status (a poison page that answered 200) is returned
 * too — the transport row calls that a success, so the lane row still owns it.
 */
export function requestStatusOf(error: unknown): number | undefined {
	if (error instanceof RequestTimeoutError) return 0;
	if (typeof error === 'object' && error !== null && transportThrown.has(error)) return 0;
	const status = (error as { status?: unknown } | null)?.status;
	if (typeof status === 'number' && Number.isInteger(status)) return status;
	// The fetchers' shared HTTP-failure message: `… failed: 503` / `… failed: HTTP 503`.
	const match = error instanceof Error ? /\bfailed: (?:HTTP )?(\d{3})\b/.exec(error.message) : null;
	return match ? Number(match[1]) : undefined;
}
