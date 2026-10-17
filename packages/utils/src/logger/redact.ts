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

// Keep the scheme when a Basic credential has already been scrubbed below.
const CREDENTIAL_PAIR =
	/(\b(?:access[_-]?token|refresh[_-]?token|jwt[_-]?token|license[_-]?key|authorization|token|password|secret)\b["']?\s*[:=]\s*["']?(?:Basic\s+(?=\[REDACTED\]))?)[^"'\s,;&#]+/gi;

/**
 * Mask a string value: show first 6 + last 5 chars, or [REDACTED] if too short.
 */
function maskValue(value: string): string {
	if (value.length <= 12) return '[REDACTED]';
	return `${value.slice(0, 6)}...${value.slice(-5)}`;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode a standard or URL-safe base64 token without Buffer/atob (neither is
 * guaranteed on every runtime this logger runs in). Returns null when the token
 * is not well-formed base64.
 */
function decodeBase64(token: string): string | null {
	const normalized = token.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
	if (normalized.length % 4 === 1) return null;
	let bits = 0;
	let buffer = 0;
	let out = '';
	for (const char of normalized) {
		const index = BASE64_ALPHABET.indexOf(char);
		if (index < 0) return null;
		buffer = (buffer << 6) | index;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out += String.fromCharCode((buffer >> bits) & 0xff);
		}
	}
	return out;
}

/**
 * A Basic credential is `base64(user:password)`: redact a candidate only when it
 * decodes to printable text with a colon, so `Basic YTpi` (a:b) is scrubbed while
 * prose such as "Basic authentication failed" is left readable.
 */
function isBasicCredential(token: string): boolean {
	const decoded = decodeBase64(token);
	return decoded !== null && decoded.includes(':') && !/[\x00-\x08\x0e-\x1f\x7f]/.test(decoded);
}

export function redactSensitiveText(value: string): string {
	return value
		.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
		.replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
		.replace(
			/\b(Basic)\s+([A-Za-z0-9+/_-]{4,}={0,2})/gi,
			(match, _scheme: string, token: string) =>
				isBasicCredential(token) ? `Basic [REDACTED]` : match
		)
		.replace(CREDENTIAL_PAIR, '$1[REDACTED]');
}

/**
 * Recursively redact sensitive fields from an object.
 * Returns a new object — does not mutate the original.
 */
export function redactSensitiveFields(obj: any): any {
	if (typeof obj === 'string') return redactSensitiveText(obj);
	if (obj == null || typeof obj !== 'object') return obj;
	if (obj instanceof Error) {
		const error = new Error(redactSensitiveText(obj.message));
		error.name = obj.name;
		if (obj.stack) error.stack = redactSensitiveText(obj.stack);
		return error;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => redactSensitiveFields(item));
	}

	// `Object.fromEntries`, not `result[key] = …`: the keys here come from arbitrary
	// logged data, payloads included, and a Woo payload key can be spelled
	// `__proto__` (stored payloads are `additionalProperties: true`). Plain
	// assignment would run Object.prototype's setter — dropping the field from the
	// log and re-parenting the result — which loses a field at exactly the moment
	// someone is reading logs to find it.
	return Object.fromEntries(
		Object.keys(obj).map((key) => {
			const value = obj[key];
			const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
			if (SENSITIVE_KEYS.has(normalizedKey) && typeof value === 'string') {
				return [key, maskValue(value)];
			}
			if (typeof value === 'string') return [key, redactSensitiveText(value)];
			if (typeof value === 'object' && value !== null) return [key, redactSensitiveFields(value)];
			return [key, value];
		})
	);
}
