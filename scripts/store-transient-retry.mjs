/**
 * Bounded retry for reads against the shared dev stores.
 *
 * dev-pro/dev-free run four php-fpm workers. When several E2E suites hit a
 * store at once it answers some requests with an error page instead of the
 * app: two main-lane native runs died in the seed on 2026-09-03 at 11:03 and
 * 11:05 UTC because /wcpos-auth/ came back as HTTP 200 without its form
 * fields, and both stores served the form correctly again minutes later.
 * A single such response must not cost a device run (and an EAS build's
 * worth of queue time), so idempotent reads retry through a blip; writes
 * never do — a duplicated POST is a real defect on a shared store.
 *
 * The budget is deliberately short: the observed blips lasted one to two
 * minutes, and the seed runs inside a job with a hard timeout, so six
 * attempts ten seconds apart (≈ 60 s) covers the observed window without
 * hiding a store that is actually down.
 */
export const STORE_TRANSIENT_ATTEMPTS = 6;
export const STORE_TRANSIENT_DELAY_MS = 10_000;

/** Thrown by a read when the store answered, but not with the app. */
export class TransientStoreError extends Error {
	constructor(message) {
		super(message);
		this.name = 'TransientStoreError';
	}
}

/** HTTP statuses a saturated or restarting store emits; never auth/route errors. */
export const isTransientStatus = (status) => status === 429 || status >= 500;

/** Node's fetch surfaces a socket/DNS failure as TypeError('fetch failed') with a cause. */
const isNetworkFailure = (err) =>
	err instanceof TypeError && err.message === 'fetch failed' && err.cause !== undefined;

export const isTransientError = (err) =>
	err instanceof TransientStoreError || isNetworkFailure(err);

/**
 * Run `read` until it returns, retrying only transient failures. Any other
 * error, or the last transient one, propagates unchanged so the caller's
 * own message (which names the seam) is what the log shows.
 */
export async function withStoreRetry(
	label,
	read,
	{
		attempts = STORE_TRANSIENT_ATTEMPTS,
		delayMs = STORE_TRANSIENT_DELAY_MS,
		sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		warn = (line) => console.warn(line),
	} = {}
) {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await read();
		} catch (err) {
			if (!isTransientError(err) || attempt >= attempts) throw err;
			warn(
				`⚠ ${label}: ${err.message} — retrying in ${delayMs / 1000}s (attempt ${attempt} of ${attempts})`
			);
			await sleep(delayMs);
		}
	}
}
