const SENSITIVE_KEYS = new Set([
	'access_token',
	'refresh_token',
	'jwt_token',
	'token',
	'password',
	'secret',
]);

/**
 * Mask a string value: show first 6 + last 5 chars, or [REDACTED] if too short.
 */
function maskValue(value: string): string {
	if (value.length <= 12) return '[REDACTED]';
	return `${value.slice(0, 6)}...${value.slice(-5)}`;
}

/**
 * Recursively redact sensitive fields from an object.
 * Returns a new object — does not mutate the original.
 */
export function redactSensitiveFields(obj: any): any {
	if (obj == null || typeof obj !== 'object') return obj;

	if (Array.isArray(obj)) {
		return obj.map((item) => redactSensitiveFields(item));
	}

	const result: Record<string, any> = {};
	for (const key of Object.keys(obj)) {
		const value = obj[key];
		if (SENSITIVE_KEYS.has(key) && typeof value === 'string') {
			result[key] = maskValue(value);
		} else if (typeof value === 'object' && value !== null) {
			result[key] = redactSensitiveFields(value);
		} else {
			result[key] = value;
		}
	}
	return result;
}
