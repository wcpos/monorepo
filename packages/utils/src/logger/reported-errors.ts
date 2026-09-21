/**
 * Errors that have already been logged with a code, so a boundary that later
 * catches the same object does not report it a second time. A non-fail-soft
 * hydration step logs `APP_START_FAILED` and then rethrows into the root
 * boundary; without this, one boot failure was two Sentry events and two Logs
 * rows, the second telling the merchant to close a message that has no close
 * control (#2112 review).
 */
const reportedErrors = new WeakSet<object>();

export function markErrorReported(error: unknown): void {
	if (error !== null && typeof error === 'object') {
		reportedErrors.add(error);
	}
}

export function isErrorReported(error: unknown): boolean {
	return error !== null && typeof error === 'object' && reportedErrors.has(error);
}
