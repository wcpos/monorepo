import { WriteDeferredError, WriteOutcomeError } from '@wcpos/query';
import { ERROR_CODES, type ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

/**
 * The log code for a failed push, from the failure's HTTP status: a 401 is the
 * session (AUTH101, "Sign in again"), a 403 is the cashier's role (AUTH201);
 * anything else keeps the generic sync code. Lives apart from `usePushDocument`
 * so a test that mocks the hook module does not lose the helper.
 */
export function pushFailureCode(error: unknown): ErrorCode {
	if (error instanceof WriteDeferredError || error instanceof WriteOutcomeError) {
		if (error.status === 401) return ERROR_CODES.SESSION_EXPIRED;
		if (error.status === 403) return ERROR_CODES.INSUFFICIENT_ROLE;
	}
	return ERROR_CODES.SYNC_UNEXPECTED;
}
