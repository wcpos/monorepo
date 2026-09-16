import { ERROR_CODES, ErrorCode } from './generated/error-codes.generated';

/**
 * Classifies an exception into an audited client code from its NAME and
 * MESSAGE only. The stack is kept in the context for the record but never
 * matched: on Electron every renderer frame carries the `wcpos://-` origin, so
 * a stack-inclusive match coded every desktop exception — a network error, a
 * render throw — as an app-start failure (#2112 review).
 */
export function mapExceptionToCode(error: unknown): {
	code: ErrorCode;
	context: Record<string, unknown>;
} {
	const context: Record<string, unknown> =
		error instanceof Error
			? { name: error.name, message: error.message, stack: error.stack }
			: { message: String(error) };
	const fingerprint = [context.name, context.message]
		.filter((value) => typeof value === 'string')
		.join(' ')
		.toLowerCase();

	if (/out of memory|heap.*memory/.test(fingerprint)) {
		return { code: ERROR_CODES.OUT_OF_MEMORY, context };
	}
	if (/access_violation|breakpoint|sigill|native crash/.test(fingerprint)) {
		return { code: ERROR_CODES.NATIVE_CRASH, context };
	}
	if (/app start|root load|wcpos:\/\//.test(fingerprint)) {
		return { code: ERROR_CODES.APP_START_FAILED, context };
	}
	return { code: ERROR_CODES.UNEXPECTED_ERROR, context };
}
