import 'whatwg-fetch';

import { AppInfo } from '@wcpos/utils/app-info';

import { refreshAccessToken, resetRefreshCooldown } from './refresh-access-token';
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
		resetRefreshCooldown();
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
			{ headers: { 'x-wcpos': '1' } }
		);
		const [refreshUrl, , requestConfig] = post.mock.calls[0];
		expect(new URL(refreshUrl).searchParams.get('wcpos_protocol')).toBe('3');
		expect(new URL(refreshUrl).searchParams.get('wcpos_client')).toBe(
			`web/${AppInfo.version} payments=1.3`
		);
		expect(requestConfig.headers).not.toHaveProperty('x-wcpos-protocol');
		expect(requestConfig.headers).not.toHaveProperty('x-wcpos-client');
		expect(wpUser.incrementalPatch).toHaveBeenCalledWith({
			access_token: 'new-token',
			expires_at: 9999,
		});
	});

	it('includes the platform User-Agent on native refresh requests', async () => {
		const webUserAgentHeader = AppInfo.userAgentHeader;
		const webPlatform = AppInfo.platform;
		AppInfo.platform = 'android';
		AppInfo.userAgentHeader = { 'user-agent': 'WCPOS/1.2.3 (android; build 45)' };
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
						'x-wcpos': '1',
						'x-wcpos-protocol': '3',
						'x-wcpos-client': `android/${AppInfo.version} payments=1.3`,
						'user-agent': 'WCPOS/1.2.3 (android; build 45)',
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
		expect(requestConfig.headers['x-wcpos-protocol']).toBe('3');
		expect(requestConfig.headers['x-wcpos-client']).toBe(`web/${AppInfo.version} payments=1.3`);
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

	it('skips a second network attempt inside the transient failure cooldown', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
		const post = jest.fn().mockRejectedValue(new Error('HTTP 503: Service Unavailable'));
		const { config } = makeConfig(post);

		await expect(refreshAccessToken(config)).resolves.toBeNull();
		await expect(refreshAccessToken(config)).resolves.toBeNull();

		expect(post).toHaveBeenCalledTimes(1);
		expect(loggerCalls.debug).toHaveBeenCalledWith(
			'Skipping token refresh - cooldown active',
			expect.objectContaining({ context: { remainingCooldownMs: 1_000 } })
		);
		now.mockRestore();
	});

	it('counts a shared failed refresh as one cooldown attempt', async () => {
		let nowMs = 10_000;
		const now = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
		const response = createDeferred<never>();
		const post = jest
			.fn()
			.mockImplementationOnce(() => response.promise)
			.mockResolvedValue({ data: { access_token: 'new-token', expires_at: 9999 }, status: 200 });
		const { config } = makeConfig(post);

		const callers = Array.from({ length: 8 }, () => refreshAccessToken(config));
		response.reject(new Error('network unavailable'));
		await expect(Promise.all(callers)).resolves.toEqual(Array(8).fill(null));
		expect(post).toHaveBeenCalledTimes(1);

		nowMs += 1_000;
		await expect(refreshAccessToken(config)).resolves.toBe('new-token');
		expect(post).toHaveBeenCalledTimes(2);
		now.mockRestore();
	});

	it('doubles the cooldown after consecutive transient failures', async () => {
		let nowMs = 10_000;
		const now = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
		const post = jest.fn().mockRejectedValue(new Error('network unavailable'));
		const { config } = makeConfig(post);

		await refreshAccessToken(config);
		nowMs += 1_000;
		await refreshAccessToken(config);
		nowMs += 1_999;
		await refreshAccessToken(config);

		expect(post).toHaveBeenCalledTimes(2);
		expect(loggerCalls.debug).toHaveBeenLastCalledWith(
			'Skipping token refresh - cooldown active',
			expect.objectContaining({ context: { remainingCooldownMs: 1 } })
		);
		now.mockRestore();
	});

	it('resets the cooldown after a successful refresh', async () => {
		let nowMs = 10_000;
		const now = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
		const post = jest
			.fn()
			.mockRejectedValueOnce(new Error('network unavailable'))
			.mockResolvedValue({ data: { access_token: 'new-token', expires_at: 9999 }, status: 200 });
		const { config } = makeConfig(post);

		await refreshAccessToken(config);
		nowMs += 1_000;
		await refreshAccessToken(config);
		await refreshAccessToken(config);

		expect(post).toHaveBeenCalledTimes(3);
		now.mockRestore();
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
			'https://example.test/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=3&wcpos_client=web%2F0.0.0+payments%3D1.3',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'x-wcpos': '1' } }
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
			'https://example.test/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=3&wcpos_client=web%2F0.0.0+payments%3D1.3',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'x-wcpos': '1' } }
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
			'https://example.test/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=3&wcpos_client=web%2F0.0.0+payments%3D1.3',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'x-wcpos': '1' } }
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
			'https://example.test/?rest_route=%2Fwcpos%2Fv2%2Fauth%2Frefresh&wcpos_protocol=3&wcpos_client=web%2F0.0.0+payments%3D1.3'
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
			'https://example.test/wp-json/wcpos/v2/auth/refresh?wcpos_protocol=3&wcpos_client=web%2F0.0.0+payments%3D1.3'
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

			await refreshAccessToken({ ...config, operationId: 'terminal-arc' });

			expect(loggerCalls.error).toHaveBeenCalledWith(
				'Unable to refresh session',
				expect.objectContaining({
					terminal: expect.objectContaining({
						outcome: 'failed',
						operationId: 'terminal-arc',
					}),
				})
			);
			expect(loggerCalls.warn).not.toHaveBeenCalled();
			expect(loggerCalls.info).not.toHaveBeenCalled();
		});

		it('keeps one transient refresh failure forensic: the session is still valid and it retries', async () => {
			const post = jest.fn().mockRejectedValue(new Error('HTTP 503: Service Unavailable'));
			const { config } = makeConfig(post);

			await refreshAccessToken({ ...config, operationId: 'transient-arc' });

			// Never AUTH101 "session ended", never AUTH999 "contact support" for a blip.
			expect(loggerCalls.warn).not.toHaveBeenCalled();
			expect(loggerCalls.error).not.toHaveBeenCalled();
			expect(loggerCalls.debug).toHaveBeenCalledWith(
				'Unable to refresh session',
				expect.objectContaining({ code: 'SYNC131' })
			);
		});

		it('counts the streak per session: another cashier’s failures do not make a first blip "persist"', async () => {
			const post = jest.fn().mockRejectedValue(new Error('Network request failed'));
			const first = makeConfig(post).config;
			const other = makeConfig(post).config;
			(other.wpUser as unknown as { id: number }).id = 2;

			let now = Date.now();
			const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
			try {
				for (let attempt = 0; attempt < 2; attempt += 1) {
					now += 120_000;
					await refreshAccessToken({ ...first, operationId: `first-${attempt}` });
				}
				now += 120_000;
				await refreshAccessToken({ ...other, operationId: 'other-0' });
			} finally {
				clock.mockRestore();
			}

			expect(loggerCalls.warn).not.toHaveBeenCalled();
			expect(loggerCalls.error).not.toHaveBeenCalled();
		});

		it('does not let another session’s backoff skip this session’s refresh', async () => {
			const post = jest.fn().mockRejectedValue(new Error('Network request failed'));
			const first = makeConfig(post).config;
			const other = makeConfig(post).config;
			(other.wpUser as unknown as { id: number }).id = 2;

			await refreshAccessToken({ ...first, operationId: 'first' });
			await refreshAccessToken({ ...other, operationId: 'other' });

			// Both sessions reached the store: the first's cooldown did not apply to the second.
			expect(post).toHaveBeenCalledTimes(2);
		});

		it('keys the session by store as well as user: the same user id on another store starts fresh', async () => {
			const post = jest.fn().mockRejectedValue(new Error('Network request failed'));
			// No `url`: the engine's session fetcher passes only the API bases.
			const storeA = makeConfig(post, { wcpos_api_url: 'https://a.test/wp-json/wcpos/v2/' }).config;
			const storeB = makeConfig(post, { wcpos_api_url: 'https://b.test/wp-json/wcpos/v2/' }).config;

			await refreshAccessToken({ ...storeA, operationId: 'a' });
			await refreshAccessToken({ ...storeB, operationId: 'b' });

			// Store A's backoff did not skip store B's refresh.
			expect(post).toHaveBeenCalledTimes(2);
		});

		it('gives the same store the same key whether or not the caller passes its url', async () => {
			const post = jest.fn().mockRejectedValue(new Error('Network request failed'));
			const engineSite = { wcpos_api_url: 'https://a.test/wp-json/wcpos/v2/' };
			const httpClientSite = { ...engineSite, url: 'https://a.test' };
			const viaEngine = makeConfig(post, engineSite);
			const viaHttpClient = makeConfig(post, httpClientSite as never);
			(viaHttpClient.config as { wpUser: unknown }).wpUser = viaEngine.wpUser;

			let now = Date.now();
			const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
			try {
				for (const config of [viaEngine.config, viaHttpClient.config, viaEngine.config]) {
					now += 120_000;
					await refreshAccessToken({ ...config, operationId: 'alternating' });
				}
			} finally {
				clock.mockRestore();
			}

			// Three failures for ONE store, alternating callers: the streak persisted.
			expect(loggerCalls.warn).toHaveBeenCalledTimes(1);
		});

		it('keeps each session’s streak its own: interleaved stores neither reset nor inflate each other', async () => {
			const post = jest.fn().mockRejectedValue(new Error('Network request failed'));
			const storeA = makeConfig(post, { wcpos_api_url: 'https://a.test/wp-json/wcpos/v2/' }).config;
			const storeB = makeConfig(post, { wcpos_api_url: 'https://b.test/wp-json/wcpos/v2/' }).config;

			let now = Date.now();
			const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
			try {
				for (const config of [storeA, storeA, storeB, storeA]) {
					now += 120_000;
					await refreshAccessToken({ ...config, operationId: 'interleaved' });
				}
			} finally {
				clock.mockRestore();
			}

			// A's third failure persists (B's in between neither reset A nor counted toward it).
			expect(loggerCalls.warn).toHaveBeenCalledTimes(1);
			expect(loggerCalls.warn).toHaveBeenCalledWith(
				'Unable to refresh session',
				expect.objectContaining({ context: expect.objectContaining({ failureStreak: 3 }) })
			);
		});

		it('codes a 2xx refresh with an unreadable body SYNC151 (malformed), not "cannot be reached"', async () => {
			const post = jest.fn().mockResolvedValue({ status: 200, data: { unexpected: true } });
			const { config } = makeConfig(post);

			await refreshAccessToken({ ...config, operationId: 'malformed' });

			expect(loggerCalls.debug).toHaveBeenCalledWith(
				'Unable to refresh session',
				expect.objectContaining({ code: 'SYNC151' })
			);
		});

		it('warns with the store’s own code once transient refresh failures persist', async () => {
			const post = jest.fn().mockRejectedValue(new Error('Network request failed'));
			const { config } = makeConfig(post);

			// Step past each backoff window so every attempt really reaches the store.
			let now = Date.now();
			const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
			try {
				for (let attempt = 0; attempt < 3; attempt += 1) {
					now += 120_000;
					await refreshAccessToken({ ...config, operationId: `transient-${attempt}` });
				}
			} finally {
				clock.mockRestore();
			}

			expect(loggerCalls.error).not.toHaveBeenCalled();
			expect(loggerCalls.warn).toHaveBeenCalledTimes(1);
			expect(loggerCalls.warn).toHaveBeenCalledWith(
				'Unable to refresh session',
				expect.objectContaining({
					code: 'SYNC121',
					context: expect.objectContaining({ failureStreak: 3 }),
				})
			);
			expect(loggerCalls.warn.mock.calls[0]?.[1]?.terminal).not.toHaveProperty('operationId');
		});
	});
});

// Wire fixtures recorded against 7bd1b8abf0 before migrating refresh preparation.
// Headers are normalized as HTTP fields, not compared as JS dictionary casing/order.
describe('refresh wire fixtures', () => {
	it.each([
		['web', false, false, '?wcpos_protocol=3&wcpos_client=web%2F0.0.0+payments%3D1.3'],
		['web', true, false, ''],
		['web', false, true, '&wcpos_protocol=3&wcpos_client=web%2F0.0.0+payments%3D1.3'],
		['web', true, true, ''],
		['android', false, false, '?wcpos_protocol=3&wcpos_client=android%2F0.0.0+payments%3D1.3'],
		['android', true, false, '?wcpos_protocol=3&wcpos_client=android%2F0.0.0+payments%3D1.3'],
		['android', false, true, '&wcpos_protocol=3&wcpos_client=android%2F0.0.0+payments%3D1.3'],
		['android', true, true, '&wcpos_protocol=3&wcpos_client=android%2F0.0.0+payments%3D1.3'],
	] as const)('%s capability=%s query=%s', async (platform, capability, query, suffix) => {
		const previous = { ...AppInfo };
		Object.assign(AppInfo, {
			platform,
			version: '0.0.0',
			userAgentHeader: platform === 'web' ? {} : { 'User-Agent': 'WCPOS/test (android)' },
		});
		requestStateManager.reset();
		resetRefreshCooldown();
		const post = jest.fn().mockResolvedValue({ data: { access_token: 'fresh', expires_at: 99 } });
		const { config } = makeConfig(post, {
			wp_api_url: 'https://example.test/blog/wp-json/',
			wcpos_api_url: 'https://example.test/blog/wp-json/wcpos/v2/',
			use_rest_route_param: query,
			use_protocol_headers: capability,
		});
		try {
			await refreshAccessToken(config);
			const [url, body, options] = post.mock.calls[0];
			expect({ url, body, headers: Object.fromEntries(new Headers(options.headers)) }).toEqual({
				url:
					(query
						? suffix
							? 'https://example.test/blog/?rest_route=%2Fwcpos%2Fv2%2Fauth%2Frefresh'
							: 'https://example.test/blog/?rest_route=/wcpos/v2/auth/refresh'
						: 'https://example.test/blog/wp-json/wcpos/v2/auth/refresh') + suffix,
				body: { refresh_token: 'refresh-token' },
				headers:
					platform === 'android'
						? {
								'x-wcpos': '1',
								'x-wcpos-protocol': '3',
								'x-wcpos-client': 'android/0.0.0 payments=1.3',
								'user-agent': 'WCPOS/test (android)',
							}
						: capability
							? {
									'x-wcpos': '1',
									'x-wcpos-protocol': '3',
									'x-wcpos-client': 'web/0.0.0 payments=1.3',
								}
							: { 'x-wcpos': '1' },
			});
		} finally {
			Object.assign(AppInfo, previous);
		}
	});
});
