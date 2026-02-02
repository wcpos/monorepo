import { createTokenRefreshHandler } from './create-token-refresh-handler';
import { requestStateManager } from './request-state-manager';

// Mock dependencies
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
		TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
		AUTH_REQUIRED: 'AUTH_REQUIRED',
	},
}));

jest.mock('./request-queue', () => ({
	pauseQueue: jest.fn(),
	resumeQueue: jest.fn(),
}));

jest.mock('./request-state-manager', () => ({
	requestStateManager: {
		startTokenRefresh: jest.fn(),
		getRefreshedToken: jest.fn(),
		setAuthFailed: jest.fn(),
	},
}));

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
	wcpos_api_url: 'https://example.com/wp-json/wcpos/v1/',
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
	originalConfig: { url: '/test', headers: {} },
	retryRequest: jest.fn().mockResolvedValue({ data: 'ok', status: 200 }),
	retryCount: 0,
	...overrides,
});

describe('createTokenRefreshHandler', () => {
	let mockPost: jest.Mock;
	let getHttpClient: () => { post: jest.Mock };

	beforeEach(() => {
		jest.clearAllMocks();
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
				site: { wcpos_api_url: undefined, wp_api_url: 'https://example.com/wp-json/' },
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
				'https://example.com/wp-json/wcpos/v1/auth/refresh',
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

		it('should set token as query param when use_jwt_as_param is true', async () => {
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
					params: expect.objectContaining({
						authorization: 'Bearer new-token',
					}),
				})
			);
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
		});
	});
});
