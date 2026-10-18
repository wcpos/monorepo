/** Give up after this many attempts; the row becomes `failed` and stops. */
export const MAX_SEND_ATTEMPTS = 6;
/** First retry lands 30s after the failure, doubling from there. */
export const BASE_BACKOFF_MS = 30_000;
/** Ceiling, so a till left offline overnight retries every 15 minutes, not every 9 hours. */
export const MAX_BACKOFF_MS = 15 * 60_000;

export function backoffMs(attempts: number): number {
	const exponent = Math.max(0, attempts - 1);
	// 2 ** 30 overflows nothing here, but the cap is applied before the shift
	// matters anyway.
	return Math.min(BASE_BACKOFF_MS * 2 ** Math.min(exponent, 20), MAX_BACKOFF_MS);
}
