import { WriteDeferredError, WriteOutcomeError, WriteOutcomeTimeoutError } from '@wcpos/query';
import { getErrorMessage } from '@wcpos/utils/logger';
import {
	ERROR_CATALOGUE,
	ERROR_CODES,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';
import type { ExtendedLogger } from '@wcpos/utils/logger';

/**
 * The log code for a failed push, from the failure's HTTP status: a 401 is the
 * session (AUTH101, "Sign in again"), a 403 is the cashier's role (AUTH201);
 * a store refusal is SYNC201 and a parked clash SYNC221 — the codes the sync
 * observer already stamped on the engine's own row for the same write; anything
 * else keeps the caller's code (the generic sync code by default). Lives apart
 * from `usePushDocument` so a test that mocks the hook module does not lose the
 * helper.
 */
export function pushFailureCode(
	error: unknown,
	fallback: ErrorCode = ERROR_CODES.SYNC_UNEXPECTED
): ErrorCode {
	if (error instanceof WriteDeferredError || error instanceof WriteOutcomeError) {
		if (error.status === 401) return ERROR_CODES.SESSION_EXPIRED;
		if (error.status === 403) return ERROR_CODES.INSUFFICIENT_ROLE;
	}
	if (error instanceof WriteOutcomeError) {
		return error.eventType === 'write-conflict'
			? ERROR_CODES.RECORD_CONFLICT
			: ERROR_CODES.RECORD_REJECTED;
	}
	return fallback;
}

/**
 * A write outcome the engine reported itself: the sync observer writes the coded
 * push.rejected / push.error / conflict row for it (apps/main/lib/sync-log-observer.ts),
 * so a UI caller that also logged it put two rows on one incident.
 */
export function isEngineReportedWriteFailure(error: unknown): boolean {
	return error instanceof WriteOutcomeError || error instanceof WriteDeferredError;
}

type PushFailureLogger = Pick<ExtendedLogger, 'error' | 'warn' | 'debug'>;

interface PushFailureReport {
	/** The caller's code for a failure that never reached the engine's outcome. */
	fallback?: ErrorCode;
	/** Already-translated "what failed" title, e.g. "Failed to save order". */
	title?: string;
	/**
	 * Already-translated title for a write that is still queued when the wait gave
	 * up. The store may yet accept it, so it must never read as "failed, enter it
	 * again" — that is how a slow store gets a duplicate customer or order.
	 * Callers whose write never awaits the store omit it (SYNC121's summary then).
	 */
	stillSendingTitle?: string;
	/**
	 * Already-translated second line for that case, when the caller's next step is
	 * not SYNC191's "nothing to do" — Pay's is "press Checkout again".
	 */
	stillSendingText2?: string;
	context?: Record<string, unknown>;
}

/**
 * The one report for a failed `engine.write` + `awaitWriteOutcome`:
 *
 * - a store refusal, clash or 401 hold is already on record from the engine, so
 *   this logs at debug and only owes the cashier the toast — with the store's
 *   own sentence when it gave one;
 * - a timeout is a write still sending: a warning, never "re-enter it";
 * - anything else failed before the engine owned the write, and is this
 *   caller's row to write at the code's own severity.
 */
export function reportPushFailure(
	logger: PushFailureLogger,
	message: string,
	error: unknown,
	{
		fallback = ERROR_CODES.SYNC_UNEXPECTED,
		title,
		stillSendingTitle,
		stillSendingText2,
		context,
	}: PushFailureReport
): void {
	const code = pushFailureCode(error, fallback);
	const fullContext = { ...context, error: getErrorMessage(error) };

	if (isEngineReportedWriteFailure(error)) {
		const serverMessage = error instanceof WriteOutcomeError ? error.serverMessage : undefined;
		const severity = ERROR_CATALOGUE[code].severity;
		logger.debug(message, {
			showToast: true,
			code,
			toast: {
				type: severity === 'error' ? 'error' : 'warning',
				// The session and role codes' own summary is the clearer sentence.
				...(serverMessage
					? { title: serverMessage }
					: code === ERROR_CODES.SESSION_EXPIRED || code === ERROR_CODES.INSUFFICIENT_ROLE
						? {}
						: title !== undefined
							? { title }
							: {}),
			},
			context: {
				...fullContext,
				reason: (error as WriteOutcomeError | WriteDeferredError).reason,
				reportedBy: 'sync-observer',
			},
		});
		return;
	}

	if (error instanceof WriteOutcomeTimeoutError) {
		logger.warn(message, {
			showToast: true,
			// SYNC191: still on its way — "don't enter it again", not "can't be reached".
			code: ERROR_CODES.WRITE_STILL_SENDING,
			...(stillSendingTitle !== undefined || stillSendingText2 !== undefined
				? {
						toast: {
							...(stillSendingTitle !== undefined && { title: stillSendingTitle }),
							...(stillSendingText2 !== undefined && { text2: stillSendingText2 }),
						},
					}
				: {}),
			context: { ...fullContext, pushState: error.diagnostics, outcome: 'still-queued' },
		});
		return;
	}

	logger.error(message, {
		showToast: true,
		code,
		...(title !== undefined ? { toast: { title } } : {}),
		context: fullContext,
	});
}
