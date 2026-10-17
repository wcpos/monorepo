import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { ERROR_CODES, type ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface RefundFailureReport {
	level: 'warn' | 'error';
	code: ErrorCode;
	/** Already-translated toast title. */
	title: string;
	/** Already-translated second line, when the code's own hint would mislead. */
	text2?: string;
}

/**
 * Statuses that are a store's definitive "no" to this refund. A 408/409/429 is a
 * request that may still be processing or may be retried by the store, so it is
 * not a refusal.
 */
function isRefusal(status: number | undefined): status is number {
	return (
		typeof status === 'number' &&
		status >= 400 &&
		status < 500 &&
		status !== 408 &&
		status !== 409 &&
		status !== 429
	);
}

/**
 * What the cashier is told about a failed refund POST.
 *
 * Every retry mints a NEW idempotency key (`createRefundIdempotencyKey`), so a
 * retry after a lost reply can refund twice. Only an offline block (nothing was
 * sent) and a store refusal (nothing was refunded) are safe to retry blind;
 * everything else must send the cashier to the order's refunds first.
 */
export function classifyRefundFailure(error: unknown, t: Translate): RefundFailureReport {
	if (isExpectedPreflightBlock(error)) {
		return {
			level: 'warn',
			code: ERROR_CODES.SYNC_UNREACHABLE,
			title: t('orders.refund_offline'),
			// SYNC121's "changes send automatically" is not true of a refund.
			text2: t('common.reconnect_then_retry'),
		};
	}

	const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
	const status = response?.status;
	if (response && isRefusal(status)) {
		return {
			level: 'error',
			code: status === 403 ? ERROR_CODES.INSUFFICIENT_ROLE : ERROR_CODES.RECORD_INVALID_FIELD,
			// The store's own sentence ("Invalid refund amount.") is the reason.
			title: extractErrorMessage(response.data, t('orders.refund_failed')),
		};
	}

	return {
		level: 'error',
		code: ERROR_CODES.PAYMENT_UNEXPECTED,
		title: t('orders.refund_outcome_unknown'),
		text2: t('orders.refund_check_before_retry'),
	};
}
