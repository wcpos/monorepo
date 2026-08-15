import { ERROR_CODES, ErrorCode } from './generated/error-codes.generated';

export function mapExceptionToCode(error: unknown): {
	code: ErrorCode;
	context: Record<string, unknown>;
} {
	const context: Record<string, unknown> =
		error instanceof Error
			? { name: error.name, message: error.message, stack: error.stack }
			: { message: String(error) };
	const fingerprint = Object.values(context).join(' ').toLowerCase();

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
