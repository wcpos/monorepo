import { RequestTimeoutError } from './transport/request-timeout';

/**
 * Errors whose failed request the host fetcher already wrote a status-0
 * `transport.request` row for (the fetch itself rejected: DNS, a refused
 * connection, a dropped socket). A lane that fails on one is reporting the same
 * incident a second time. A WeakSet rather than a wrapper type, so callers that
 * check `error.name` or `instanceof TypeError` see the original.
 *
 * Marked by the host, at the line that writes the row — never by a wrapper
 * around the whole fetch, which also sees rejections (a broken body stream
 * after a 200) that no transport row reported.
 */
const transportThrown = new WeakSet<object>();

/**
 * Whether a request that ended with `status` is one the transport layer
 * reports as failed: 0 (no response), or any answer outside 2xx except the
 * 304 a conditional poll expects. The cashier log keeps a lane or requirement
 * row about such a request quiet; a 2xx poison page is NOT reported (the
 * transport row read it as a success), so the lane row still owns it.
 */
export function isReportedRequestStatus(status: unknown): boolean {
	return (
		typeof status === 'number' && status !== 304 && (status === 0 || status < 200 || status >= 300)
	);
}

/** Record that the host wrote a transport row for `error` (see `transportThrown`). */
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
	// Several concurrent failures: reported only if EVERY one was — a local
	// failure inside the aggregate has no other row to report it.
	if (error instanceof AggregateError) {
		const statuses = error.errors.map(requestStatusOf);
		return statuses.length > 0 && statuses.every(isReportedRequestStatus) ? statuses[0] : undefined;
	}
	if (error instanceof RequestTimeoutError) return 0;
	if (typeof error === 'object' && error !== null && transportThrown.has(error)) return 0;
	const status = (error as { status?: unknown } | null)?.status;
	if (typeof status === 'number' && Number.isInteger(status)) return status;
	// The fetchers' shared HTTP-failure message: `… failed: 503` / `… failed: HTTP 503`.
	const match = error instanceof Error ? /\bfailed: (?:HTTP )?(\d{3})\b/.exec(error.message) : null;
	return match ? Number(match[1]) : undefined;
}
