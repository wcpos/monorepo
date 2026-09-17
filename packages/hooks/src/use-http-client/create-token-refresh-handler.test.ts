import 'whatwg-fetch';

import { createTokenRefreshHandler } from './create-token-refresh-handler';
import { resetRefreshCooldown } from './refresh-access-token';
import { requestStateManager } from './request-state-manager';

// Mock dependencies
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

jest.mock('./request-queue', () => ({
	pauseQueue: jest.fn(),
	resumeQueue: jest.fn(),
}));

jest.mock('./request-state-manager', () => {
	const setAuthFailed = jest.fn();
	return {
		requestStateManager: {
			startTokenRefresh: jest.fn(),
			getRefreshedToken: jest.fn(),
			setAuthFailed,
			// Reflect reality: setAuthFailed(true) → isAuthFailed() === true. Reading the latest
			// setAuthFailed call keeps the two consistent and auto-resets via clearAllMocks() per test.
			isAuthFailed: jest.fn(() => {
				const calls = setAuthFailed.mock.calls;
				return calls.length > 0 && calls[calls.length - 1][0] === true;
			}),
		},
	};
});

const makeWpUser = (overrides: any = {}) => ({
	id: 1,
	refresh_token: 'valid-refresh-token',
	incrementalPatch: jest.fn().mockResolvedValue(undefined),
	getLatest: function () {
		return this;
	},
	...overrides,
});

const makeSite = (overrides: any = {}) => ({
	wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
	url: 'https://example.com',
	...overrides,
});

const makeError = (status = 401) => {
	const err: any = new Error('Request failed');
	err.response = { status };
	return err;
};

const makeContext = (overrides: any = {}) => ({
	error: makeError(401),
	originalConfig: { url: '/test', headers: {}, wcposPreamble: { purpose: 'rest', site: {} } },
	retryRequest: jest.fn().mockResolvedValue({ data: 'ok', status: 200 }),
	retryCount: 0,
	...overrides,
});

describe('createTokenRefreshHandler', () => {
	let mockPost: jest.Mock;
	let getHttpClient: () => { post: jest.Mock };

	beforeEach(() => {
		jest.clearAllMocks();
		resetRefreshCooldown();
		mockPost = jest.fn();
		getHttpClient = () => ({ post: mockPost });
	});

	describe('canHandle', () => {
		it('should handle 401 errors', () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});
			expect(handler.canHandle(makeError(401))).toBe(true);
		});

		it('should not handle non-401 errors', () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});
			expect(handler.canHandle(makeError(500))).toBe(false);
		});

		it('should not handle 403 permission errors', () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});
			expect(handler.canHandle(makeError(403))).toBe(false);
		});

		it('should not handle errors without response', () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});
			const err: any = new Error('Network error');
			expect(handler.canHandle(err)).toBe(false);
		});
	});

	describe('handler metadata', () => {
		it('should have correct name and priority', () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});
			expect(handler.name).toBe('token-refresh');
			expect(handler.priority).toBe(100);
			expect(handler.intercepts).toBe(true);
		});
	});

	describe('handle', () => {
		it('should throw if no API URL available', async () => {
			const handler = createTokenRefreshHandler({
				site: { wcpos_api_url: undefined, wp_api_url: undefined },
				wpUser: makeWpUser(),
				getHttpClient,
			});
			const ctx = makeContext();
			await expect(handler.handle(ctx)).rejects.toThrow();
		});

		it('should throw if no refresh token', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser({ refresh_token: undefined }),
				getHttpClient,
			});
			const ctx = makeContext();
			await expect(handler.handle(ctx)).rejects.toThrow();
		});

		it('should use wp_api_url as fallback for constructing API URL', async () => {
			const wpUser = makeWpUser();
			const handler = createTokenRefreshHandler({
				site: {
					wcpos_api_url: undefined,
					wp_api_url: 'https://example.com/wp-json/',
				},
				wpUser,
				getHttpClient,
			});

			mockPost.mockResolvedValue({
				data: { access_token: 'new-token', expires_at: 9999 },
				status: 200,
			});

			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});
			(requestStateManager.getRefreshedToken as jest.Mock).mockReturnValue('new-token');

			const ctx = makeContext();
			await handler.handle(ctx);

			expect(mockPost).toHaveBeenCalledWith(
				'https://example.com/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=2&wcpos_client=web%2F0.0.0',
				expect.any(Object),
				expect.any(Object)
			);
		});

		it('should refresh token and retry request on success', async () => {
			const wpUser = makeWpUser();
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser,
				getHttpClient,
			});

			mockPost.mockResolvedValue({
				data: { access_token: 'new-token', expires_at: 9999 },
				status: 200,
			});

			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});
			(requestStateManager.getRefreshedToken as jest.Mock).mockReturnValue('new-token');

			const ctx = makeContext();
			const retryResponse = { data: 'retried', status: 200 };
			ctx.retryRequest.mockResolvedValue(retryResponse);

			const result = await handler.handle(ctx);

			expect(wpUser.incrementalPatch).toHaveBeenCalledWith({
				access_token: 'new-token',
				expires_at: 9999,
			});
			expect(ctx.retryRequest).toHaveBeenCalled();
			expect(result).toEqual(retryResponse);
		});

		it('passes the refreshed token as metadata without authoring credentials', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite({ use_jwt_as_param: true }),
				wpUser: makeWpUser(),
				getHttpClient,
			});

			mockPost.mockResolvedValue({
				data: { access_token: 'new-token', expires_at: 9999 },
				status: 200,
			});

			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});
			(requestStateManager.getRefreshedToken as jest.Mock).mockReturnValue('new-token');

			const ctx = makeContext();
			await handler.handle(ctx);

			expect(ctx.retryRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					headers: {},
					wcposPreamble: expect.objectContaining({
						refreshedAccessToken: 'new-token',
					}),
				})
			);
		});

		it.each([
			['header', {}, { headers: { Authorization: 'Bearer new-token' } }],
			[
				'query',
				{ use_jwt_as_param: true, wcpos_version: '1.10.0' },
				{ params: { authorization: 'new-token' } },
			],
		])(
			'a bare config without preamble metadata retries with the credential on the config (%s)',
			async (_channel, siteOverrides, expected) => {
				const handler = createTokenRefreshHandler({
					site: makeSite(siteOverrides),
					wpUser: makeWpUser(),
					getHttpClient,
				});
				mockPost.mockResolvedValue({
					data: { access_token: 'new-token', expires_at: Date.now() + 3600000 },
					status: 200,
				});
				(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
					await fn();
				});
				(requestStateManager.getRefreshedToken as jest.Mock).mockReturnValue('new-token');

				// A relative URL the preamble module cannot compose: the retry must not
				// manufacture metadata for it (Codex review on #2132). It carries a stale
				// credential on BOTH channels; the retry must keep only the fresh one.
				const ctx = makeContext({
					originalConfig: {
						url: '/test?authorization=old&per_page=10',
						headers: { authorization: 'Bearer old' },
						params: { authorization: 'old', page: '2' },
					},
				});
				const result = await handler.handle(ctx);

				expect(result).toEqual({ data: 'ok', status: 200 });
				const retried = ctx.retryRequest.mock.calls[0][0];
				expect(retried.wcposPreamble).toBeUndefined();
				expect(retried).toMatchObject(expected);
				if ('params' in expected) {
					expect(retried.headers.authorization).toBeUndefined();
					expect(retried.headers.Authorization).toBeUndefined();
					expect(retried.params.page).toBe('2');
					// Axios appends params to an existing query: the stale URL token must go too.
					expect(retried.url).toBe('/test?per_page=10');
					// A fragment must not be parsed as query data (Codex review on #2151).
					const fragmentCtx = makeContext({
						originalConfig: { url: '/test?authorization=old&per_page=10#authorization=old' },
					});
					await handler.handle(fragmentCtx);
					expect(fragmentCtx.retryRequest.mock.calls[0][0].url).toBe(
						'/test?per_page=10#authorization=old'
					);
				} else {
					expect(retried.params).toEqual({ page: '2' });
					expect(retried.url).toBe('/test?per_page=10');
				}
			}
		);

		it('a bare config with URLSearchParams keeps its existing query parameters on retry', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite({ use_jwt_as_param: true, wcpos_version: '1.10.0' }),
				wpUser: makeWpUser(),
				getHttpClient,
			});
			mockPost.mockResolvedValue({
				data: { access_token: 'new-token', expires_at: Date.now() + 3600000 },
				status: 200,
			});
			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});
			(requestStateManager.getRefreshedToken as jest.Mock).mockReturnValue('new-token');

			// Spreading URLSearchParams drops its entries (CodeRabbit on #2132).
			const params = new URLSearchParams({ per_page: '10', authorization: 'old' });
			const ctx = makeContext({ originalConfig: { url: '/test', params } });
			await handler.handle(ctx);

			const retried = ctx.retryRequest.mock.calls[0][0];
			expect(retried.params).toBeInstanceOf(URLSearchParams);
			expect(retried.params.get('per_page')).toBe('10');
			expect(retried.params.get('authorization')).toBe('new-token');
		});

		it('partial preamble site metadata is filled from the handler site', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite({ use_jwt_as_param: true, wcpos_version: '1.10.0' }),
				wpUser: makeWpUser(),
				getHttpClient,
			});
			mockPost.mockResolvedValue({
				data: { access_token: 'new-token', expires_at: Date.now() + 3600000 },
				status: 200,
			});
			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});
			(requestStateManager.getRefreshedToken as jest.Mock).mockReturnValue('new-token');

			// A caller that sent `site: {}` must still retry on the site's query channel.
			const ctx = makeContext({
				originalConfig: { url: '/test', wcposPreamble: { purpose: 'rest', site: {} } },
			});
			await handler.handle(ctx);

			const retried = ctx.retryRequest.mock.calls[0][0];
			expect(retried.wcposPreamble.site.use_jwt_as_param).toBe(true);
			expect(retried.wcposPreamble.site.wcpos_version).toBe('1.10.0');
			expect(retried.wcposPreamble.refreshedAccessToken).toBe('new-token');
		});

		it('should throw if refresh response has no access_token', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});

			mockPost.mockResolvedValue({
				data: {},
				status: 200,
			});

			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});

			const ctx = makeContext();
			await expect(handler.handle(ctx)).rejects.toThrow();
		});

		it('should throw if getRefreshedToken returns null after refresh', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});

			mockPost.mockResolvedValue({
				data: { access_token: 'new-token', expires_at: 9999 },
				status: 200,
			});

			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});
			(requestStateManager.getRefreshedToken as jest.Mock).mockReturnValue(null);

			const ctx = makeContext();
			await expect(handler.handle(ctx)).rejects.toThrow();
		});

		it('should re-throw 403 retry failures without marking auth failed', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});

			mockPost.mockResolvedValue({
				data: { access_token: 'new-token', expires_at: 9999 },
				status: 200,
			});

			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});
			(requestStateManager.getRefreshedToken as jest.Mock).mockReturnValue('new-token');

			const retryError = makeError(403);
			const ctx = makeContext();
			ctx.retryRequest.mockRejectedValue(retryError);

			await expect(handler.handle(ctx)).rejects.toBe(retryError);
			expect(requestStateManager.setAuthFailed).not.toHaveBeenCalled();
			expect(ctx.error).not.toHaveProperty('isRefreshTokenInvalid');
			expect(ctx.error).not.toHaveProperty('refreshTokenInvalid');
		});

		it('should mark auth failed and flag error when refresh token is invalid', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});

			const refreshError = new Error('401 Unauthorized');
			mockPost.mockRejectedValue(refreshError);

			// The startTokenRefresh callback calls httpClient.post which throws,
			// then the catch block calls handleRefreshError which throws the original error
			// with isRefreshTokenInvalid flag. We need to let the real callback run.
			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				await fn();
			});

			const ctx = makeContext();
			try {
				await handler.handle(ctx);
				fail('should have thrown');
			} catch (err: any) {
				expect(requestStateManager.setAuthFailed).toHaveBeenCalledWith(true);
				expect(err.isRefreshTokenInvalid).toBe(true);
			}
		});

		it('should re-throw original error for transient refresh failures', async () => {
			const handler = createTokenRefreshHandler({
				site: makeSite(),
				wpUser: makeWpUser(),
				getHttpClient,
			});

			const transientError = new Error('Network timeout');
			(requestStateManager.startTokenRefresh as jest.Mock).mockImplementation(async (fn) => {
				try {
					await fn();
				} catch {
					// pass
				}
				throw transientError;
			});

			mockPost.mockRejectedValue(transientError);

			const ctx = makeContext();
			await expect(handler.handle(ctx)).rejects.toThrow();
			// A transient refresh failure must stay retryable: no re-auth, no invalid flag.
			expect(requestStateManager.setAuthFailed).not.toHaveBeenCalledWith(true);
			expect(ctx.error).not.toHaveProperty('isRefreshTokenInvalid');
		});
	});
});
