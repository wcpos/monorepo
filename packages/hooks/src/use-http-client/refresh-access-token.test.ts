import { AppInfo } from '@wcpos/utils/app-info';

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
	site: {
		wcpos_api_url?: string;
		wp_api_url?: string;
		use_rest_route_param?: boolean;
		use_protocol_headers?: boolean;
	} = {
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
			expect.any(String),
			{ refresh_token: 'refresh-token' },
			{ headers: { 'X-WCPOS': '1' } }
		);
		const [refreshUrl, , requestConfig] = post.mock.calls[0];
		expect(new URL(refreshUrl).searchParams.get('wcpos_protocol')).toBe('2');
		expect(new URL(refreshUrl).searchParams.get('wcpos_client')).toBe(`web/${AppInfo.version}`);
		expect(requestConfig.headers).not.toHaveProperty('X-WCPOS-Protocol');
		expect(requestConfig.headers).not.toHaveProperty('X-WCPOS-Client');
		expect(wpUser.incrementalPatch).toHaveBeenCalledWith({
			access_token: 'new-token',
			expires_at: 9999,
		});
	});

	it('includes the platform User-Agent on native refresh requests', async () => {
		const webUserAgentHeader = AppInfo.userAgentHeader;
		const webPlatform = AppInfo.platform;
		AppInfo.platform = 'android';
		AppInfo.userAgentHeader = { 'User-Agent': 'WCPOS/1.2.3 (android; build 45)' };
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config } = makeConfig(post);

		try {
			await refreshAccessToken(config);

			expect(post).toHaveBeenCalledWith(
				expect.any(String),
				{ refresh_token: 'refresh-token' },
				{
					headers: {
						'X-WCPOS': '1',
						'X-WCPOS-Protocol': '2',
						'X-WCPOS-Client': `android/${AppInfo.version}`,
						'User-Agent': 'WCPOS/1.2.3 (android; build 45)',
					},
				}
			);
		} finally {
			AppInfo.platform = webPlatform;
			AppInfo.userAgentHeader = webUserAgentHeader;
		}
	});

	it('uses protocol headers and omits protocol params on capable web sites', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config } = makeConfig(post, {
			wcpos_api_url: 'https://example.test/wp-json/wcpos/v2/',
			use_protocol_headers: true,
		});

		await refreshAccessToken(config);

		const [refreshUrl, , requestConfig] = post.mock.calls[0];
		expect(new URL(refreshUrl).searchParams.has('wcpos_protocol')).toBe(false);
		expect(new URL(refreshUrl).searchParams.has('wcpos_client')).toBe(false);
		expect(requestConfig.headers['X-WCPOS-Protocol']).toBe('2');
		expect(requestConfig.headers['X-WCPOS-Client']).toBe(`web/${AppInfo.version}`);
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
			'https://example.test/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=2&wcpos_client=web%2F0.0.0',
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
			'https://example.test/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=2&wcpos_client=web%2F0.0.0',
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
			'https://example.test/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=2&wcpos_client=web%2F0.0.0',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'X-WCPOS': '1' } }
		);
	});

	it('posts refresh to the query-form transport', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config } = makeConfig(post, {
			wp_api_url: 'https://example.test/?rest_route=/',
			wcpos_api_url: 'https://example.test/wp-json/wcpos/v2/',
			use_rest_route_param: true,
		});

		await expect(refreshAccessToken(config)).resolves.toBe('new-token');
		expect(post.mock.calls[0]?.[0]).toBe(
			'https://example.test/?rest_route=%2Fwcpos%2Fv2%2Fauth%2Frefresh&wcpos_protocol=2&wcpos_client=web%2F0.0.0'
		);
	});

	it('keeps the path form when the flag is set but wp_api_url is absent', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config } = makeConfig(post, {
			wcpos_api_url: 'https://example.test/wp-json/wcpos/v2/',
			use_rest_route_param: true,
		});

		await expect(refreshAccessToken(config)).resolves.toBe('new-token');
		expect(post.mock.calls[0]?.[0]).toBe(
			'https://example.test/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=2&wcpos_client=web%2F0.0.0'
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
