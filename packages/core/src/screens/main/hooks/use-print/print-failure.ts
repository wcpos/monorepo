import { getErrorMessage } from '@wcpos/utils/logger';
import {
	ERROR_CATALOGUE,
	ERROR_CODES,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';
import type { ExtendedLogger } from '@wcpos/utils/logger';

import { describePrinterError } from '../../settings/printer/describe-printer-error';

type PrintLogger = Pick<ExtendedLogger, 'debug' | 'warn' | 'error'>;
type Translate = (key: string) => string;

/**
 * The cashier closed the print dialog (iOS rejects with expo-print's
 * PrintIncompleteException) or the print service shut the job down. Not a failure.
 */
const CANCELLED = /Printing did not complete|Print job cancelled|Printer service is closing/i;

/** The printer was never reached: no connection, no answer, no address. */
const UNREACHABLE =
	/timed out|timeout|ETIMEDOUT|ECONNREFUSED|refused|not responding|bluetooth.*unavailable|is not connected|missing its device key|missing an address|Failed to fetch|MODULE_MISSING/i;

export type PrintFailure = { cancelled: true } | { cancelled: false; code: ErrorCode };

/**
 * PRINT101 when an automatic print did not happen (the sale is saved; print it from
 * the receipt), PRINT301 when the printer could not be reached, PRINT201 when the
 * job went out but did not complete.
 */
export function classifyPrintFailure(
	error: unknown,
	{ autoPrint = false }: { autoPrint?: boolean } = {}
): PrintFailure {
	const code = (error as { code?: unknown } | null)?.code;
	const message = getErrorMessage(error);
	if (code === 'ERR_PRINT_INCOMPLETE' || CANCELLED.test(message)) return { cancelled: true };
	if (autoPrint) return { cancelled: false, code: ERROR_CODES.AUTOPRINT_DID_NOT_START };
	if (UNREACHABLE.test(message)) return { cancelled: false, code: ERROR_CODES.PRINTER_UNREACHABLE };
	return { cancelled: false, code: ERROR_CODES.PRINT_JOB_FAILED };
}

/**
 * The one report for a failed print: a cancel is forensic; a real failure is one
 * coded row at the code's severity and a toast — Print must never fail silently —
 * whose second line is the specific thing to check when the message names one.
 */
export function reportPrintFailure(
	logger: PrintLogger,
	message: string,
	error: unknown,
	t: Translate,
	{ autoPrint = false, context }: { autoPrint?: boolean; context?: Record<string, unknown> } = {}
): void {
	const failure = classifyPrintFailure(error, { autoPrint });
	const fullContext = { ...context, error: getErrorMessage(error) };
	if (failure.cancelled) {
		logger.debug(`${message} (cancelled)`, { context: fullContext });
		return;
	}
	const { key } = describePrinterError(error);
	const level = ERROR_CATALOGUE[failure.code].severity === 'error' ? 'error' : 'warn';
	logger[level](message, {
		showToast: true,
		code: failure.code,
		// The generic line adds nothing to the code's own hint; a specific one does.
		...(key !== 'settings.setup_err_generic' ? { toast: { text2: t(key) } } : {}),
		context: fullContext,
	});
}

/**
 * The row for a failed TEST print. The settings screen shows its own toast or inline
 * error, so this writes the coded row only (the transport rows are forensic) — a
 * printer fault must still reach Logs and support.
 */
export function logTestPrintFailure(
	logger: PrintLogger,
	error: unknown,
	context?: Record<string, unknown>
): void {
	const failure = classifyPrintFailure(error);
	const fullContext = { ...context, error: getErrorMessage(error) };
	if (failure.cancelled) {
		logger.debug('Test print cancelled', { context: fullContext });
		return;
	}
	const level = ERROR_CATALOGUE[failure.code].severity === 'error' ? 'error' : 'warn';
	logger[level]('Test print failed', { code: failure.code, context: fullContext });
}
