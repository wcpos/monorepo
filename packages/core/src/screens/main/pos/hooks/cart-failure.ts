import { getErrorMessage } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { ExtendedLogger } from '@wcpos/utils/logger';
import type { ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';
type CartLogger = Pick<ExtendedLogger, 'error' | 'warn'>;
interface CartFailureReport {
	/** Already-translated cashier copy for the toast title. */
	toastTitle: string;
	/** Defaults to ERROR_CODES.CART_UPDATE_FAILED. */
	code?: ErrorCode;
	context?: Record<string, unknown>;
	/** A caught unknown; its message is appended to context as `error`. */
	error?: unknown;
}
/** Cashier-visible cart failure: error-level log + toast (cashier-full-information ruling). */
export function reportCartFailure(
	logger: CartLogger,
	message: string,
	{ toastTitle, code, context, error }: CartFailureReport
): void {
	logger.error(message, {
		showToast: true,
		code: code ?? ERROR_CODES.CART_UPDATE_FAILED,
		toast: { title: toastTitle },
		context: error === undefined ? context : { ...context, error: getErrorMessage(error) },
	});
}
/** The cashier acted on a line that is no longer in the order (stale row — multi-tab is first-class): warn-level log + toast, no error code. */
export function reportStaleCartLine(
	logger: CartLogger,
	message: string,
	{ toastTitle, context }: { toastTitle: string; context?: Record<string, unknown> }
): void {
	logger.warn(message, {
		showToast: true,
		toast: { title: toastTitle },
		context,
	});
}
/** Invariant break unreachable through the UI: error log with UNEXPECTED_ERROR, deliberately NO toast (a toast for an impossible state is noise). */
export function reportCartInvariant(
	logger: CartLogger,
	message: string,
	context?: Record<string, unknown>
): void {
	logger.error(message, { code: ERROR_CODES.UNEXPECTED_ERROR, context });
}
