import { redactPersonalData, redactSensitiveFields, redactSensitiveText } from './redact';

describe('redactPersonalData', () => {
	it.each([
		['jane.doe+pos@example.co.uk', '[EMAIL]'],
		['+61 412 345 678', '[PHONE]'],
		['0412 345 678', '[PHONE]'],
		['+34 612 345 678', '[PHONE]'],
		['+34612345678', '[PHONE]'],
		['(555) 123-4567', '[PHONE]'],
		['06 12 34 56 78', '[PHONE]'],
		['06.12.34.56.78', '[PHONE]'],
		['555.123.4567', '[PHONE]'],
		['jane%40example.com', '[EMAIL]'],
		['/orders?email=jane%40example.com', '/orders?email=[EMAIL]'],
		['jane@exämple.de', '[EMAIL]'],
		['Context: {"phone":"0612345678"}', 'Context: {"phone":"[PHONE]"}'],
		['?mobile=0612345678', '?mobile=[PHONE]'],
		['(02) 9876 5432', '[PHONE]'],
		['555-123-4567', '[PHONE]'],
		['+1 (555) 123-4567', '[PHONE]'],
		['call 0412 345 678.', 'call [PHONE].'],
	])('masks %s', (input, expected) => {
		expect(redactPersonalData(input)).toBe(expected);
	});
	it.each([
		'0412345678',
		'1234567',
		'/orders/1234567',
		'1763287940123',
		'Build 20261116',
		'Mon Nov 16 2026 10:12:20 GMT+0100 (Central European Standard Time)',
		'index.js:2:1234567',
		'(1234567)',
		'550e8400-e29b-41d4-a716-446655440000',
		'12345678-1234-1234-1234-123456789012',
		'2.0.4',
		'2026.11.19',
		'192.168.100.200',
		'192.168.1.10:8080',
		'telemetry: allowed',
		'2026-11-16',
		'2026-11-16T10:12:20.123Z',
		'2026-11-16 10:12:20',
		'123e4567-e89b-12d3-a456-426614174000',
		'1.10.18',
		'order 12345',
		'HTTP 503',
		'1234567.89',
		'https://[REDACTED]@shop.example.com/wp-json',
	])('preserves %s', (input) => {
		expect(redactPersonalData(input)).toBe(input);
	});
	it.each([
		'a'.repeat(100_000),
		'1-'.repeat(50_000),
		'1 '.repeat(50_000),
		'1.'.repeat(50_000),
		'tel'.repeat(33_334),
	])('scrubs long input %# within 50 ms', (input) => {
		const start = performance.now();
		redactPersonalData(input);
		expect(performance.now() - start).toBeLessThan(50);
	});
	it('leaves personal data in local logs unchanged', () => {
		expect(redactSensitiveFields({ email: 'jane@example.com' })).toEqual({
			email: 'jane@example.com',
		});
	});
});

describe('redactSensitiveFields', () => {
	it.each([
		['Authorization: Basic YWRtaW46c2VjcmV0', 'Authorization: Basic [REDACTED]'],
		['Retry with Basic YWRtaW46c2VjcmV0 now', 'Retry with Basic [REDACTED] now'],
		['Retry with bAsIc YWRtaW46c2VjcmV0 now', 'Retry with Basic [REDACTED] now'],
		['Basic YWJjZDplZg==, Basic YTpi', 'Basic [REDACTED], Basic [REDACTED]'],
		['Authorization: Basic YTpi', 'Authorization: Basic [REDACTED]'],
		['token=YWRtaW46c2VjcmV0 Basic YWRtaW46c2VjcmV0', 'token=[REDACTED] Basic [REDACTED]'],
		// test:€ — a UTF-8 password (RFC 7617) must still be recognised.
		['Authorization: Basic dGVzdDrigqw=', 'Authorization: Basic [REDACTED]'],
		// Firstname Lastname:secret — a space-separated user id (RFC 7613 §3.1).
		[
			'Authorization: Basic Rmlyc3RuYW1lIExhc3RuYW1lOnNlY3JldA==',
			'Authorization: Basic [REDACTED]',
		],
	])('redacts Basic credentials in %s while preserving the scheme', (input, expected) => {
		expect(redactSensitiveFields(input)).toBe(expected);
	});

	it.each([
		'Basic authentication failed',
		'Basic realm="WordPress"',
		'Basic abcd+/_-',
		'Basic Only mode',
		'Basic Auth required',
	])('leaves prose after Basic alone when it is not a user:password encoding: %s', (input) => {
		expect(redactSensitiveText(input)).toBe(input);
	});

	it('should redact access_token at top level', () => {
		const input = { access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef' };
		const result = redactSensitiveFields(input);
		expect(result.access_token).toBe('eyJhbG...bcdef');
	});

	it('keeps an own `__proto__` key as ordinary data', () => {
		// Stored payloads are `additionalProperties: true`, so a Woo key spelled
		// `__proto__` reaches the logger as OWN data. Building the redacted copy with
		// `result[key] = …` would run Object.prototype's setter, dropping the field
		// from the log and re-parenting the result.
		const input = JSON.parse('{"__proto__":{"note":"data"},"kept":"value"}');
		const result = redactSensitiveFields(input);

		expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
		expect(result['__proto__']).toEqual({ note: 'data' });
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		expect(result.kept).toBe('value');
	});

	it('should redact refresh_token at top level', () => {
		const input = { refresh_token: 'abc123def456ghi789' };
		const result = redactSensitiveFields(input);
		expect(result.refresh_token).toBe('abc123...hi789');
	});

	it('should redact jwt_token at top level', () => {
		const input = { jwt_token: 'short' };
		const result = redactSensitiveFields(input);
		expect(result.jwt_token).toBe('[REDACTED]');
	});

	it('should redact nested sensitive fields', () => {
		const input = {
			writeRow: {
				document: {
					access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
					licenseKey: 'license-key-value-12345',
					username: 'testuser',
				},
			},
		};
		const result = redactSensitiveFields(input);
		expect(result.writeRow.document.access_token).toMatch(/^.{6}\.{3}.{5}$/);
		expect(result.writeRow.document.licenseKey).toBe('licens...12345');
		expect(result.writeRow.document.username).toBe('testuser');
	});

	it('should redact credentials embedded in URL and message strings', () => {
		const input = {
			url: 'https://user:password@store.test/path?authorization=Bearer%20secret-token',
			message: 'Connecting with Bearer abc.def.ghi and licenseKey=license-key-value-12345',
			messages: ['Retrying with Bearer array-secret'],
		};
		const serialized = JSON.stringify(redactSensitiveFields(input));

		expect(serialized).not.toContain('user:password');
		expect(serialized).not.toContain('secret-token');
		expect(serialized).not.toContain('abc.def.ghi');
		expect(serialized).not.toContain('license-key-value-12345');
		expect(serialized).not.toContain('array-secret');
	});

	it('should handle arrays', () => {
		const input = { items: [{ access_token: 'abcdefghijklmnop' }] };
		const result = redactSensitiveFields(input);
		expect(result.items[0].access_token).toBe('abcdef...lmnop');
	});

	it('preserves Error instances while redacting their diagnostics', () => {
		const error = new Error('Request failed with Bearer secret-token');
		error.stack = 'Error: Request failed with Bearer secret-token\n    at checkout';

		const result = redactSensitiveFields({ error });

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error.message).toBe('Request failed with Bearer [REDACTED]');
		expect(result.error.stack).toBe(
			'Error: Request failed with Bearer [REDACTED]\n    at checkout'
		);
	});

	it('should return primitives unchanged', () => {
		expect(redactSensitiveFields('hello')).toBe('hello');
		expect(redactSensitiveFields(42)).toBe(42);
		expect(redactSensitiveFields(null)).toBe(null);
	});

	it('should not mutate the original object', () => {
		const input = { access_token: 'original_token_value_here' };
		redactSensitiveFields(input);
		expect(input.access_token).toBe('original_token_value_here');
	});
});
