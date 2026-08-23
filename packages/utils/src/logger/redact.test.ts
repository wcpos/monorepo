import { redactSensitiveFields } from './redact';

describe('redactSensitiveFields', () => {
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
