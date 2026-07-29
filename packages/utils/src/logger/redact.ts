const SENSITIVE_KEYS = new Set([
	'accesstoken',
	'refreshtoken',
	'jwttoken',
	'token',
	'password',
	'secret',
	'licensekey',
	'authorization',
]);

const CREDENTIAL_PAIR =
	/(\b(?:access[_-]?token|refresh[_-]?token|jwt[_-]?token|license[_-]?key|authorization|token|password|secret)\b["']?\s*[:=]\s*["']?)[^"'\s,;&#]+/gi;

/**
 * Mask a string value: show first 6 + last 5 chars, or [REDACTED] if too short.
 */
function maskValue(value: string): string {
	if (value.length <= 12) return '[REDACTED]';
	return `${value.slice(0, 6)}...${value.slice(-5)}`;
}

export function redactSensitiveText(value: string): string {
	return value
		.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
		.replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
		.replace(CREDENTIAL_PAIR, '$1[REDACTED]');
}

/**
 * Recursively redact sensitive fields from an object.
 * Returns a new object — does not mutate the original.
 */
export function redactSensitiveFields(obj: any): any {
	if (typeof obj === 'string') return redactSensitiveText(obj);
	if (obj == null || typeof obj !== 'object') return obj;

	if (Array.isArray(obj)) {
		return obj.map((item) => redactSensitiveFields(item));
	}

	const result: Record<string, any> = {};
	for (const key of Object.keys(obj)) {
		const value = obj[key];
		const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
		if (SENSITIVE_KEYS.has(normalizedKey) && typeof value === 'string') {
			result[key] = maskValue(value);
		} else if (typeof value === 'string') {
			result[key] = redactSensitiveText(value);
		} else if (typeof value === 'object' && value !== null) {
			result[key] = redactSensitiveFields(value);
		} else {
			result[key] = value;
		}
	}
	return result;
}
