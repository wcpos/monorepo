const PREFIX = '[template-studio]';

export function debugLog(scope: string, message: string, details?: Record<string, unknown>): void {
	console.debug(`${PREFIX} ${scope}: ${message}`, details ?? {});
}

export function debugInfo(scope: string, message: string, details?: Record<string, unknown>): void {
	console.info(`${PREFIX} ${scope}: ${message}`, details ?? {});
}

export function debugWarn(scope: string, message: string, details?: Record<string, unknown>): void {
	console.warn(`${PREFIX} ${scope}: ${message}`, details ?? {});
}

export function debugError(
	scope: string,
	message: string,
	details?: Record<string, unknown>
): void {
	console.error(`${PREFIX} ${scope}: ${message}`, details ?? {});
}
