import { ERROR_CODES, type ErrorCode } from './generated/error-codes.generated';

/** Store refusals that name a field the cashier can correct where it was entered. */
const INVALID_FIELD_REASONS = new Set(['pos_data_invalid', 'rest_invalid_param']);

/**
 * The code for a write the store refused, from its status and machine reason. ONE
 * mapping for every reporter of the same refusal — the sync observer's push.rejected
 * row and the screen's toast must agree: a 403 is the cashier's role (AUTH201), an
 * invalid field is SYNC211 ("correct the value"), anything else SYNC201 ("settle it
 * in Store health").
 */
export function rejectedWriteCode(status: unknown, reason: unknown): ErrorCode {
	if (status === 403) return ERROR_CODES.INSUFFICIENT_ROLE;
	if (typeof reason === 'string' && INVALID_FIELD_REASONS.has(reason)) {
		return ERROR_CODES.RECORD_INVALID_FIELD;
	}
	return ERROR_CODES.RECORD_REJECTED;
}
