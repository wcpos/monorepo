/**
 * @jest-environment node
 */
import { buildAuthUrl, generateState, parseAuthResult } from './utils';

// Mock expo-auth-session for getRedirectUri
jest.mock('expo-auth-session', () => ({
	makeRedirectUri: jest.fn(() => 'wcpos://callback'),
}));

describe('use-wcpos-auth utils', () => {
	describe('generateState', () => {
		it('should generate a 64-character hex string', () => {
			const state = generateState();
			expect(state).toHaveLength(64);
			expect(/^[0-9a-f]+$/.test(state)).toBe(true);
		});

		it('should generate unique values each time', () => {
			const state1 = generateState();
			const state2 = generateState();
			const state3 = generateState();

			expect(state1).not.toBe(state2);
			expect(state2).not.toBe(state3);
			expect(state1).not.toBe(state3);
		});
	});

	describe('buildAuthUrl', () => {
		it('should build a URL with redirect_uri and state params', () => {
			const url = buildAuthUrl('https://example.com/auth', 'https://app/callback', 'state123');

			const parsed = new URL(url);
			expect(parsed.origin).toBe('https://example.com');
			expect(parsed.pathname).toBe('/auth');
			expect(parsed.searchParams.get('redirect_uri')).toBe('https://app/callback');
			expect(parsed.searchParams.get('state')).toBe('state123');
		});

		it('should include extra params when provided', () => {
			const url = buildAuthUrl('https://example.com/auth', 'https://app/callback', 'state123', {
				scope: 'read write',
				client_id: 'myapp',
			});

			const parsed = new URL(url);
			expect(parsed.searchParams.get('scope')).toBe('read write');
			expect(parsed.searchParams.get('client_id')).toBe('myapp');
		});

		it('should handle empty extraParams', () => {
			const url = buildAuthUrl('https://example.com/auth', 'https://app/callback', 'state123', {});

			const parsed = new URL(url);
			expect(parsed.searchParams.get('redirect_uri')).toBe('https://app/callback');
			expect(parsed.searchParams.get('state')).toBe('state123');
		});

		it('should preserve existing query params in auth endpoint', () => {
			const url = buildAuthUrl(
				'https://example.com/auth?existing=param',
				'https://app/callback',
				'state123'
			);

			const parsed = new URL(url);
			expect(parsed.searchParams.get('existing')).toBe('param');
			expect(parsed.searchParams.get('redirect_uri')).toBe('https://app/callback');
		});
	});

	describe('parseAuthResult', () => {
		describe('successful authentication', () => {
			it('should parse auth params from query string', () => {
				const url =
					'https://app/callback?access_token=abc123&refresh_token=def456&uuid=user-uuid&id=123&display_name=John&expires_at=1234567890&token_type=Bearer';

				const result = parseAuthResult(url);

				expect(result.type).toBe('success');
				expect(result.params).toEqual({
					access_token: 'abc123',
					refresh_token: 'def456',
					uuid: 'user-uuid',
					id: '123',
					display_name: 'John',
					expires_at: 1234567890,
					token_type: 'Bearer',
				});
			});

			it('should parse auth params from hash fragment', () => {
				const url =
					'https://app/callback#access_token=abc123&refresh_token=def456&uuid=user-uuid&id=123&display_name=John&expires_at=1234567890';

				const result = parseAuthResult(url);

				expect(result.type).toBe('success');
				expect(result.params?.access_token).toBe('abc123');
				expect(result.params?.uuid).toBe('user-uuid');
			});

			it('should handle missing optional fields with defaults', () => {
				const url =
					'https://app/callback?access_token=abc&refresh_token=def&uuid=uid&expires_at=0';

				const result = parseAuthResult(url);

				expect(result.type).toBe('success');
				expect(result.params?.id).toBe('');
				expect(result.params?.display_name).toBe('');
				expect(result.params?.token_type).toBe('Bearer');
			});

			it('should parse expires_at as integer', () => {
				const url =
					'https://app/callback?access_token=abc&refresh_token=def&uuid=uid&expires_at=1735689600';

				const result = parseAuthResult(url);

				expect(result.type).toBe('success');
				expect(result.params?.expires_at).toBe(1735689600);
				expect(typeof result.params?.expires_at).toBe('number');
			});

			it('should handle missing expires_at as 0', () => {
				const url = 'https://app/callback?access_token=abc&refresh_token=def&uuid=uid';

				const result = parseAuthResult(url);

				expect(result.type).toBe('success');
				expect(result.params?.expires_at).toBe(0);
			});
		});

		describe('error responses', () => {
			it('should return error when error param is present', () => {
				const url =
					'https://app/callback?error=access_denied&error_description=User%20denied%20access';

				const result = parseAuthResult(url);

				expect(result.type).toBe('error');
				expect(result.error).toBe('User denied access');
				expect(result.errorCode).toBe('access_denied');
			});

			it('should use error code as error message when description is missing', () => {
				const url = 'https://app/callback?error=invalid_request';

				const result = parseAuthResult(url);

				expect(result.type).toBe('error');
				expect(result.error).toBe('invalid_request');
				expect(result.errorCode).toBe('invalid_request');
			});

			it('should handle error in hash fragment', () => {
				const url =
					'https://app/callback#error=server_error&error_description=Internal%20error';

				const result = parseAuthResult(url);

				expect(result.type).toBe('error');
				expect(result.error).toBe('Internal error');
			});
		});

		describe('missing required params', () => {
			it('should return error when access_token is missing', () => {
				const url = 'https://app/callback?refresh_token=def&uuid=uid';

				const result = parseAuthResult(url);

				expect(result.type).toBe('error');
				expect(result.error).toBe('Missing required auth parameters');
			});

			it('should return error when refresh_token is missing', () => {
				const url = 'https://app/callback?access_token=abc&uuid=uid';

				const result = parseAuthResult(url);

				expect(result.type).toBe('error');
				expect(result.error).toBe('Missing required auth parameters');
			});

			it('should return error when uuid is missing', () => {
				const url = 'https://app/callback?access_token=abc&refresh_token=def';

				const result = parseAuthResult(url);

				expect(result.type).toBe('error');
				expect(result.error).toBe('Missing required auth parameters');
			});
		});

		describe('no params', () => {
			it('should return error when URL has no query or hash', () => {
				const url = 'https://app/callback';

				const result = parseAuthResult(url);

				expect(result.type).toBe('error');
				expect(result.error).toBe('No auth parameters found in URL');
			});

			it('should return error for empty hash', () => {
				const url = 'https://app/callback#';

				const result = parseAuthResult(url);

				expect(result.type).toBe('error');
				// Empty hash has no params, so should be "missing required"
			});
		});

		describe('invalid URLs', () => {
			it('should return error for invalid URL format', () => {
				const result = parseAuthResult('not-a-valid-url');

				expect(result.type).toBe('error');
				// Error message varies by runtime, just verify it's an error
				expect(result.error).toBeDefined();
			});

			it('should return error for malformed URL', () => {
				const result = parseAuthResult('://missing-protocol');

				expect(result.type).toBe('error');
				expect(result.error).toBeDefined();
			});
		});

		describe('edge cases', () => {
			it('should handle URL-encoded values', () => {
				const url =
					'https://app/callback?access_token=abc&refresh_token=def&uuid=uid&display_name=John%20Doe%20%26%20Jane';

				const result = parseAuthResult(url);

				expect(result.type).toBe('success');
				expect(result.params?.display_name).toBe('John Doe & Jane');
			});

			it('should prefer query params over hash when both present', () => {
				const url =
					'https://app/callback?access_token=query&refresh_token=def&uuid=uid#access_token=hash';

				const result = parseAuthResult(url);

				expect(result.type).toBe('success');
				expect(result.params?.access_token).toBe('query');
			});

			it('should handle empty string values', () => {
				const url =
					'https://app/callback?access_token=abc&refresh_token=def&uuid=uid&display_name=';

				const result = parseAuthResult(url);

				expect(result.type).toBe('success');
				expect(result.params?.display_name).toBe('');
			});
		});
	});
});
