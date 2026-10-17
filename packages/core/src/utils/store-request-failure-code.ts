import { mapToInternalCode } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { ERROR_CODES, type ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

/**
 * The code for a failed store request, from what the store actually did: its
 * WordPress error code, else its HTTP status (5xx SYNC131, 401 AUTH101, 403
 * AUTH201…), else — no reply at all — SYNC121 "can't be reached". Anything that
 * is not a request failure stays the generic unexpected error.
 */
export function storeRequestFailureCode(error: unknown): ErrorCode {
	const failure = error as {
		wpCode?: ErrorCode;
		isAxiosError?: boolean;
		response?: { status?: number };
	} | null;
	if (failure?.wpCode) return failure.wpCode;
	if (failure?.response?.status) {
		return mapToInternalCode(null, failure.response.status) ?? ERROR_CODES.UNEXPECTED_ERROR;
	}
	return failure?.isAxiosError ? ERROR_CODES.SYNC_UNREACHABLE : ERROR_CODES.UNEXPECTED_ERROR;
}
