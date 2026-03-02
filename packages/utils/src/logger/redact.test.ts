import { redactSensitiveFields } from './redact';

describe('redactSensitiveFields', () => {
	it('should redact access_token at top level', () => {
		const input = { access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef' };
		const result = redactSensitiveFields(input);
		expect(result.access_token).toBe('eyJhbG...bcdef');
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
					username: 'testuser',
				},
			},
		};
		const result = redactSensitiveFields(input);
		expect(result.writeRow.document.access_token).toMatch(/^.{6}\.{3}.{5}$/);
		expect(result.writeRow.document.username).toBe('testuser');
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
