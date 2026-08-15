import { refreshAccessToken } from './refresh-access-token';
import { requestStateManager } from './request-state-manager';

jest.mock('@wcpos/utils/logger', () => {
	const loggerCalls = {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	};
	return { getLogger: () => loggerCalls, __loggerCalls: loggerCalls };
});

const { __loggerCalls: loggerCalls } = jest.requireMock('@wcpos/utils/logger') as {
	__loggerCalls: Record<'debug' | 'info' | 'warn' | 'error', jest.Mock>;
};

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function makeConfig(
	post: jest.Mock,
	site: { wcpos_api_url?: string; wp_api_url?: string } = {
		wcpos_api_url: 'https://example.test/wp-json/wcpos/v2/',
	}
) {
	const wpUser = {
		id: 1,
		refresh_token: 'refresh-token',
		incrementalPatch: jest.fn().mockResolvedValue(undefined),
		getLatest() {
			return this;
		},
	};
	return {
		config: {
			site,
			wpUser,
			getHttpClient: () => ({ post }),
		},
		wpUser,
	};
}

describe('refreshAccessToken', () => {
	beforeEach(() => {
		requestStateManager.reset();
	});

	it('includes the POS namespace header and persists the refreshed token', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config, wpUser } = makeConfig(post);

		const token = await refreshAccessToken(config);

		expect(token).toBe('new-token');
		expect(post).toHaveBeenCalledWith(
			'https://example.test/wp-json/wcpos/v2/auth/refresh',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'X-WCPOS': '1' } }
		);
		expect(wpUser.incrementalPatch).toHaveBeenCalledWith({
			access_token: 'new-token',
			expires_at: 9999,
		});
	});

	it('returns null and marks authentication failed when refresh fails', async () => {
		const post = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));
		const { config } = makeConfig(post);

		await expect(refreshAccessToken(config)).resolves.toBeNull();

		expect(requestStateManager.checkCanProceed()).toEqual(
			expect.objectContaining({
				ok: false,
				reason: 'Please log in to continue',
			})
		);
	});

	it('keeps a transient failure retryable without latching authFailed', async () => {
		const post = jest.fn().mockRejectedValue(new Error('HTTP 503: Service Unavailable'));
		const { config } = makeConfig(post);

		await expect(refreshAccessToken(config)).resolves.toBeNull();

		// A 5xx (or network) blip must not force re-authentication.
		expect(requestStateManager.isAuthFailed()).toBe(false);
	});

	it('does not attempt a refresh once authentication has terminally failed', async () => {
		const post = jest.fn();
		const { config } = makeConfig(post);
		requestStateManager.setAuthFailed(true);

		await expect(refreshAccessToken(config)).resolves.toBeNull();

		expect(post).not.toHaveBeenCalled();
	});

	it('appends auth/refresh to a wcpos_api_url with no trailing slash', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config } = makeConfig(post, {
			wcpos_api_url: 'https://example.test/wp-json/wcpos/v2',
		});

		await expect(refreshAccessToken(config)).resolves.toBe('new-token');
		expect(post).toHaveBeenCalledWith(
			'https://example.test/wp-json/wcpos/v2/auth/refresh',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'X-WCPOS': '1' } }
		);
	});

	it('migrates a persisted v1 base before refreshing', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config } = makeConfig(post, {
			wcpos_api_url: 'https://example.test/wp-json/wcpos/v1/',
		});

		await expect(refreshAccessToken(config)).resolves.toBe('new-token');
		expect(post).toHaveBeenCalledWith(
			'https://example.test/wp-json/wcpos/v2/auth/refresh',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'X-WCPOS': '1' } }
		);
	});

	it('falls back to wp_api_url when wcpos_api_url is unset', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config } = makeConfig(post, {
			wp_api_url: 'https://example.test/wp-json/',
		});

		await expect(refreshAccessToken(config)).resolves.toBe('new-token');
		expect(post).toHaveBeenCalledWith(
			'https://example.test/wp-json/wcpos/v2/auth/refresh',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'X-WCPOS': '1' } }
		);
	});

	it('awaits an in-flight refresh instead of posting a duplicate', async () => {
		const response = createDeferred<{
			data: { access_token: string; expires_at: number };
			status: number;
		}>();
		const post = jest.fn(() => response.promise);
		const { config, wpUser } = makeConfig(post);

		const firstRefresh = refreshAccessToken(config);
		const secondRefresh = refreshAccessToken(config);
		response.resolve({
			data: { access_token: 'shared-token', expires_at: 9999 },
			status: 200,
		});

		await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
			'shared-token',
			'shared-token',
		]);
		expect(post).toHaveBeenCalledTimes(1);
		expect(wpUser.incrementalPatch).toHaveBeenCalledTimes(1);
	});

	// #899: the level of an auth event reflects the settled outcome. A successful
	// refresh is the healthy ending of the TTL cycle — one positive lifecycle
	// breadcrumb, chained to the driving request's arc.
	describe('settled-outcome logging (#899)', () => {
		beforeEach(() => {
			loggerCalls.info.mockClear();
			loggerCalls.warn.mockClear();
			loggerCalls.error.mockClear();
		});

		it('emits one localized "Session renewed" info row carrying the driving arc id', async () => {
			const post = jest.fn().mockResolvedValue({
				data: { access_token: 'new-token', expires_at: 9999 },
				status: 200,
			});
			const { config } = makeConfig(post);

			await refreshAccessToken({
				...config,
				sessionRenewedMessage: 'Sitzung automatisch erneuert',
				operationId: 'auth-arc-1',
			});

			expect(loggerCalls.info).toHaveBeenCalledTimes(1);
			expect(loggerCalls.info).toHaveBeenCalledWith(
				'Sitzung automatisch erneuert',
				expect.objectContaining({
					terminal: expect.objectContaining({
						outcome: 'ok',
						operationType: 'auth.refresh',
						operationId: 'auth-arc-1',
					}),
				})
			);
		});

		it('falls back to the English copy when no translator is threaded through', async () => {
			const post = jest.fn().mockResolvedValue({
				data: { access_token: 'new-token', expires_at: 9999 },
				status: 200,
			});
			const { config } = makeConfig(post);

			await refreshAccessToken(config);

			expect(loggerCalls.info).toHaveBeenCalledWith(
				'Session renewed automatically',
				expect.anything()
			);
		});

		it('emits the breadcrumb once per refresh CYCLE, not per coalesced caller', async () => {
			const response = createDeferred<{
				data: { access_token: string; expires_at: number };
				status: number;
			}>();
			const post = jest.fn(() => response.promise);
			const { config } = makeConfig(post);

			const first = refreshAccessToken({
				...config,
				operationId: 'auth-arc-driver',
			});
			const second = refreshAccessToken({
				...config,
				operationId: 'auth-arc-peer',
			});
			response.resolve({
				data: { access_token: 'shared-token', expires_at: 9999 },
				status: 200,
			});
			await Promise.all([first, second]);

			expect(loggerCalls.info).toHaveBeenCalledTimes(1);
			expect(loggerCalls.info).toHaveBeenCalledWith(
				'Session renewed automatically',
				expect.objectContaining({
					terminal: expect.objectContaining({ operationId: 'auth-arc-driver' }),
				})
			);
		});

		it('logs a terminally rejected refresh token at error (user action required)', async () => {
			const post = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));
			const { config } = makeConfig(post);

			await refreshAccessToken(config);

			expect(loggerCalls.error).toHaveBeenCalledWith(
				'Unable to refresh session',
				expect.objectContaining({
					terminal: expect.objectContaining({ outcome: 'failed' }),
				})
			);
			expect(loggerCalls.warn).not.toHaveBeenCalled();
			expect(loggerCalls.info).not.toHaveBeenCalled();
		});

		it('keeps a transient refresh failure at warn (attention only if it persists)', async () => {
			const post = jest.fn().mockRejectedValue(new Error('HTTP 503: Service Unavailable'));
			const { config } = makeConfig(post);

			await refreshAccessToken(config);

			expect(loggerCalls.warn).toHaveBeenCalledWith('Unable to refresh session', expect.anything());
			expect(loggerCalls.error).not.toHaveBeenCalled();
		});
	});
});
