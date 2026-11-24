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
	// user:password with a non-empty user made of printable, non-space characters; a
	// bare colon or a leading colon (`Only` decodes to `:yr`) is prose, not a credential.
	// The decoder yields one character per byte, so 0x80–0xFF are UTF-8 lead and
	// continuation bytes (RFC 7617 allows UTF-8 credentials), not control characters.
	return (
		decoded !== null &&
		// RFC 7617 allows any printable text in the user-id except a colon, spaces included
		// (`Firstname Lastname:secret`); the user part must be non-empty and not start with
		// a space, which keeps `Only` (`:yr`) prose.
		/^[\x21-\x39\x3b-\x7e\u0080-\u00ff][\x20-\x39\x3b-\x7e\u0080-\u00ff]*:[\x20-\x7e\u0080-\u00ff]*$/.test(
			decoded
		)
	);
}

// Every quantifier is bounded and every run start anchored: these patterns run
// synchronously in beforeSend.
const EMAIL =
	/(^|[^\w.%+\-\u00a1-\uffff])[\w.%+\-\u00a1-\uffff]{1,64}(?:@|%40|%2540)(?:[\w\-\u00a1-\uffff]{1,63}\.){1,8}[a-z\u00a1-\uffff]{2,63}/gi;
const PHONE =
	/(^|[^\w+.-])(\+?\(?\d{1,15}(?:[ .()\u00a0\u202f-]{1,3}\d{1,15}){0,14})(?![\w-]|[.:]\d)/g;
const PHONE_FIELD =
	/(^|[^a-z_])([a-z_]{0,32}(?:phone|tel|mobile)[a-z_]{0,32}["']?\s{0,3}[:=]\s{0,3}["']?)([^\s"'&,;}]{1,64})/gi;
const PHONE_DATE_PREFIX = /^\d{4}[-.]\d{1,2}[-.]\d{1,2}(?!\d)[ .()\-\u00a0\u202f]{0,3}/;
const IPV4 =
	/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\.?\d)/;

// Phones beside dates or other phones used to escape when the whole run was rejected.
function maskPhoneRun(phone: string): string {
	const datePrefix = phone.match(PHONE_DATE_PREFIX)?.[0];
	if (datePrefix) {
		const rest = phone.slice(datePrefix.length);
		return rest ? datePrefix + maskPhoneRun(rest) : phone;
	}
	if (IPV4.test(phone)) return phone;
	const digits = phone.replace(/\D/g, '').length;
	const groups = phone.split(/\D+/).filter(Boolean);
	return (digits >= 7 &&
		digits <= 15 &&
		(phone.startsWith('+') || groups.length >= (/[ ()\u00a0\u202f-]/.test(phone) ? 2 : 3))) ||
		(digits > 15 && /[ \u00a0\u202f]/.test(phone) && groups.every((group) => group.length <= 4))
		? '[PHONE]'
		: phone;
}

export function redactPersonalData(value: string): string {
	return value
		.replace(EMAIL, '$1[EMAIL]')
		.replace(PHONE, (match, prefix, phone) => prefix + maskPhoneRun(phone))
		.replace(PHONE_FIELD, (match, prefix, key, phone) =>
			/\d/.test(phone) ? `${prefix}${key}[PHONE]` : match
		);
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
