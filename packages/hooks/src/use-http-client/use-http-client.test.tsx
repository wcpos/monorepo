import 'whatwg-fetch';

import { renderHook } from '@testing-library/react';
import { CanceledError, isCancel } from 'axios';

import { AppInfo } from '@wcpos/utils/app-info';

jest.mock('@wcpos/utils/logger', () => {
	const debug = jest.fn();
	const info = jest.fn();
	const error = jest.fn();
	const warn = jest.fn();
	const mapExceptionToCode = jest.fn(() => ({
		code: 'CLIENT999',
		context: { name: 'Error', message: 'network down' },
	}));
	return {
		getLogger: jest.fn(() => ({ debug, info, warn, error })),
		getDatabaseEpoch: jest.fn(() => 0),
		mapExceptionToCode,
		__debug: debug,
		__info: info,
		__error: error,
		__warn: warn,
	};
});

jest.mock('./http', () => ({
	http: { request: jest.fn(), isCancel: jest.fn(() => false) },
}));

jest.mock('./request-queue', () => ({
	scheduleRequest: jest.fn((request: () => Promise<unknown>) => request()),
}));

jest.mock('./request-state-manager', () => ({
	requestStateManager: {
		checkCanProceed: jest.fn(() => ({ ok: true })),
		isTokenRefreshing: jest.fn(() => false),
		awaitTokenRefresh: jest.fn(),
	},
}));

/* eslint-disable import/first -- mocks must precede the code under test */
import { http } from './http';
import { requestStateManager } from './request-state-manager';
import { useHttpClient, type WcposRequestConfig } from './use-http-client';

import type { HttpErrorHandler } from './types';
/* eslint-enable import/first */

const loggerMock = jest.requireMock('@wcpos/utils/logger') as {
	__debug: jest.Mock;
	__info: jest.Mock;
	__error: jest.Mock;
	__warn: jest.Mock;
	getDatabaseEpoch: jest.Mock;
	mapExceptionToCode: jest.Mock;
};

describe('useHttpClient network audit logs', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		loggerMock.getDatabaseEpoch.mockReturnValue(0);
		(requestStateManager.isTokenRefreshing as jest.Mock).mockReturnValue(false);
	});

	it('stamps the WCPOS marker but authors NO User-Agent on web (B10)', async () => {
		// This suite maps @wcpos/utils/app-info to the WEB variant, whose UA
		// fragment is empty: Firefox honours fetch UA overrides, and replacing
		// the browser UA with a product string reads as a bot to WAF heuristics.
		// The native/Electron fragment (UA present) is pinned in
		// apps/main/lib/engine-fetcher.test.ts, which resolves the native variant.
		(http.request as jest.Mock).mockResolvedValue({ status: 200, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.request({
			method: 'GET',
			url: 'https://example.com/wp-json/wcpos/v2/products',
		});

		const config = (http.request as jest.Mock).mock.calls[0][0];
		expect(config.headers['x-wcpos']).toBe('1');
		expect(config.headers).not.toHaveProperty('x-wcpos-protocol');
		expect(config.headers).not.toHaveProperty('x-wcpos-client');
		expect(config.headers).not.toHaveProperty('user-agent');
	});

	it('stamps protocol and client headers outside web', async () => {
		const webPlatform = AppInfo.platform;
		AppInfo.platform = 'electron';
		(http.request as jest.Mock).mockResolvedValue({ status: 200, data: {} });
		const { result } = renderHook(() => useHttpClient());

		try {
			await result.current.get('https://example.com/wp-json/wcpos/v2/products');

			const config = (http.request as jest.Mock).mock.calls[0][0];
			expect(config.headers['x-wcpos-protocol']).toBe('2');
			expect(config.headers['x-wcpos-client']).toBe(`electron/${AppInfo.version}`);
		} finally {
			AppInfo.platform = webPlatform;
		}
	});

	it('stamps protocol and client headers on web when the request opts in', async () => {
		(http.request as jest.Mock).mockResolvedValue({ status: 200, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.request({
			method: 'GET',
			url: 'https://example.com/wp-json/wcpos/v2/products',
			protocolHeaders: true,
		} as never);

		const config = (http.request as jest.Mock).mock.calls[0][0];
		expect(config.headers['x-wcpos-protocol']).toBe('2');
		expect(config.headers['x-wcpos-client']).toBe(`web/${AppInfo.version}`);
	});

	it('persists mutating responses with a sanitized searchable endpoint', async () => {
		(http.request as jest.Mock).mockResolvedValue({ status: 201, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.post(
			'https://user:password@store.example.test/wc/v3/orders?authorization=secret',
			{}
		);

		expect(loggerMock.__info).toHaveBeenCalledWith('HTTP request completed', {
			context: expect.objectContaining({
				method: 'POST',
				endpoint: '/wc/v3/orders',
				status: 201,
			}),
		});
	});

	it('maps response-backed non-WordPress failures by HTTP status', async () => {
		const failure = Object.assign(new Error('server unavailable'), {
			response: { status: 503, data: '<html>Service unavailable</html>' },
		});
		(http.request as jest.Mock).mockRejectedValue(failure);
		const { result } = renderHook(() => useHttpClient());

		await expect(
			result.current.get(
				'https://user:password@store.example.test/wc/v3/products?authorization=secret'
			)
		).rejects.toBe(failure);

		expect(loggerMock.__error).toHaveBeenCalledWith('HTTP request failed: GET /wc/v3/products', {
			code: 'SYNC131',
			context: expect.objectContaining({
				method: 'GET',
				endpoint: '/wc/v3/products',
				status: 503,
			}),
		});
		expect(loggerMock.mapExceptionToCode).not.toHaveBeenCalled();
	});

	it('persists mapped and server WordPress error codes on the HTTP failure row', async () => {
		const failure = Object.assign(new Error('request failed'), {
			response: {
				status: 503,
				data: {
					code: 'merchant_plugin_unknown_error',
					message: 'Unexpected response',
					data: { status: 503 },
				},
			},
		});
		(http.request as jest.Mock).mockRejectedValue(failure);
		const { result } = renderHook(() => useHttpClient());

		await expect(result.current.get('/wc/v3/products')).rejects.toBe(failure);

		expect(loggerMock.__error).toHaveBeenCalledWith('HTTP request failed: GET /wc/v3/products', {
			code: 'SYNC131',
			context: expect.objectContaining({
				serverCode: 'merchant_plugin_unknown_error',
				triage: true,
			}),
		});
	});

	it('reports an update-required refusal before logging and rethrowing it', async () => {
		const failure = Object.assign(new Error('update required'), {
			response: {
				status: 426,
				data: {
					code: 'wcpos_update_required',
					message: 'This store requires a newer version of WCPOS.',
					data: { status: 426, min_protocol: 2, plugin_version: '1.11.0' },
				},
			},
		});
		const onUpdateRequired = jest.fn();
		(http.request as jest.Mock).mockRejectedValue(failure);
		const { result } = renderHook(() => useHttpClient([], onUpdateRequired));

		await expect(result.current.post('/wcpos/v2/orders', {})).rejects.toBe(failure);

		expect(onUpdateRequired).toHaveBeenCalledWith({
			minProtocol: 2,
			pluginVersion: '1.11.0',
			status: 426,
		});
		expect(onUpdateRequired.mock.invocationCallOrder[0]).toBeLessThan(
			loggerMock.__error.mock.invocationCallOrder[0]
		);
	});

	it('persists status zero for response-less transport failures', async () => {
		const failure = new Error('network down');
		(http.request as jest.Mock).mockRejectedValue(failure);
		const { result } = renderHook(() => useHttpClient());

		await expect(result.current.get('/wc/v3/products')).rejects.toBe(failure);

		expect(loggerMock.__error).toHaveBeenCalledWith('HTTP request failed: GET /wc/v3/products', {
			code: 'CLIENT999',
			context: expect.objectContaining({
				status: 0,
				codeFallback: true,
				name: 'Error',
				message: 'network down',
			}),
		});
		expect(loggerMock.mapExceptionToCode).toHaveBeenCalledWith(failure);
	});

	it('demotes quietErrors transport failures to warn and still rethrows', async () => {
		const failure = new Error('network down');
		(http.request as jest.Mock).mockRejectedValue(failure);
		const { result } = renderHook(() => useHttpClient());

		await expect(
			result.current.get('/wp-content/uploads/product.jpg', { quietErrors: true })
		).rejects.toBe(failure);

		expect(loggerMock.__error).not.toHaveBeenCalled();
		expect(loggerMock.__warn).toHaveBeenCalledWith(
			'HTTP request failed: GET /wp-content/uploads/product.jpg',
			{
				code: 'CLIENT999',
				context: expect.objectContaining({
					method: 'GET',
					endpoint: '/wp-content/uploads/product.jpg',
					status: 0,
					codeFallback: true,
				}),
			}
		);
	});

	it.each([false, true])(
		'logs handler failure only for a replacement error (%s)',
		async (replace) => {
			const failure = Object.assign(new Error('expired'), {
				response: { status: 401 },
				isRefreshTokenInvalid: true,
			});
			const handlerError = replace ? new Error('refresh broke') : failure;
			(http.request as jest.Mock).mockRejectedValue(failure);
			const recovered = { status: 200, data: {} } as import('axios').AxiosResponse;
			const fallback = jest.fn(async () => recovered);
			const { result } = renderHook(() =>
				useHttpClient([
					{
						name: 'token-refresh',
						priority: 100,
						intercepts: true,
						canHandle: () => true,
						handle: async () => {
							throw handlerError;
						},
					},
					{ name: 'fallback', canHandle: () => true, handle: fallback },
				])
			);
			if (replace) {
				await expect(result.current.get('/wc/v3/products')).rejects.toBe(handlerError);
				expect(fallback).not.toHaveBeenCalled();
				expect(loggerMock.__error).toHaveBeenCalledWith(
					'Error handler token-refresh threw an error',
					expect.objectContaining({
						code: 'CLIENT999',
						context: expect.objectContaining({ error: 'refresh broke' }),
					})
				);
			} else {
				await expect(result.current.get('/wc/v3/products')).resolves.toBe(recovered);
				expect(fallback).toHaveBeenCalledTimes(1);
				expect(loggerMock.__error).not.toHaveBeenCalled();
				expect(loggerMock.__debug).toHaveBeenCalledWith(expect.any(String), {
					context: { handlerName: 'token-refresh', status: 401 },
				});
			}
		}
	);

	it('rejects with an intercepting handler cancellation without error-level logging', async () => {
		const failure = Object.assign(new Error('expired'), { response: { status: 401 } });
		const cancellation = new CanceledError();
		(http.request as jest.Mock).mockRejectedValue(failure);
		const cancelSpy = jest.spyOn(http, 'isCancel').mockImplementation(isCancel);
		const nextHandler = jest.fn();
		const { result } = renderHook(() =>
			useHttpClient([
				{
					name: 'fallback-auth-handler',
					priority: 50,
					intercepts: true,
					canHandle: () => true,
					handle: async () => {
						throw cancellation;
					},
				},
				{ name: 'next', canHandle: () => true, handle: nextHandler },
			])
		);
		try {
			await expect(result.current.get('/wc/v3/products')).rejects.toBe(cancellation);
			expect(nextHandler).not.toHaveBeenCalled();
			expect(loggerMock.__error).not.toHaveBeenCalled();
			expect(loggerMock.__debug).toHaveBeenCalledWith(expect.stringContaining('CanceledError'), {
				context: { handlerName: 'fallback-auth-handler', status: 401 },
			});
		} finally {
			cancelSpy.mockReturnValue(false);
		}
	});

	it('does not persist a recovered request as a failure', async () => {
		const failure = Object.assign(new Error('expired'), { response: { status: 401 } });
		(http.request as jest.Mock).mockRejectedValue(failure);
		const recovered = { status: 200, data: {} } as import('axios').AxiosResponse;
		const handler = {
			name: 'recover',
			canHandle: jest.fn(() => true),
			handle: jest.fn(async () => recovered),
		};
		const { result } = renderHook(() => useHttpClient([handler]));

		await expect(result.current.get('/wc/v3/products')).resolves.toBe(recovered);
		expect(loggerMock.__error).not.toHaveBeenCalled();
	});

	it('does not persist an intentional cancellation as a failure', async () => {
		const cancellation = new Error('cancelled');
		(http.request as jest.Mock).mockRejectedValue(cancellation);
		(http.isCancel as unknown as jest.Mock).mockReturnValue(true);
		const { result } = renderHook(() => useHttpClient());

		await expect(result.current.get('/wc/v3/products')).rejects.toBe(cancellation);
		expect(loggerMock.__error).not.toHaveBeenCalled();
	});

	it('does not persist a pre-flight block as a network failure', async () => {
		(requestStateManager.checkCanProceed as jest.Mock).mockReturnValueOnce({
			ok: false,
			reason: 'offline',
		});
		const { result } = renderHook(() => useHttpClient());

		await expect(result.current.get('/wc/v3/products')).rejects.toThrow('offline');
		expect(http.request).not.toHaveBeenCalled();
		expect(loggerMock.__error).not.toHaveBeenCalled();
	});

	it('does not persist a completion after the active store changes', async () => {
		loggerMock.getDatabaseEpoch.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(1);
		(http.request as jest.Mock).mockResolvedValue({ status: 201, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.post('/wc/v3/orders', {});

		expect(loggerMock.__info).not.toHaveBeenCalled();
	});

	it('does not persist a completion when the store changes during token refresh', async () => {
		(requestStateManager.isTokenRefreshing as jest.Mock).mockReturnValue(true);
		(requestStateManager.awaitTokenRefresh as jest.Mock).mockImplementation(async () => {
			loggerMock.getDatabaseEpoch.mockReturnValue(1);
		});
		(http.request as jest.Mock).mockResolvedValue({ status: 201, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.post('/wc/v3/orders', {});

		expect(loggerMock.__info).not.toHaveBeenCalled();
	});

	it('applies the default request timeout when none is provided', async () => {
		(http.request as jest.Mock).mockResolvedValue({ status: 200, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.get('/wc/v3/products');

		expect(http.request).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30_000 }));
	});

	it('preserves an explicit request timeout', async () => {
		(http.request as jest.Mock).mockResolvedValue({ status: 200, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.get('/wc/v3/products', { timeout: 5_000 });

		expect(http.request).toHaveBeenCalledWith(expect.objectContaining({ timeout: 5_000 }));
	});

	it('preserves zero as an explicit request timeout opt-out', async () => {
		(http.request as jest.Mock).mockResolvedValue({ status: 200, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.get('/wc/v3/products', { timeout: 0 });

		expect(http.request).toHaveBeenCalledWith(expect.objectContaining({ timeout: 0 }));
	});
});

describe('request preamble dispatch seam', () => {
	const canonical: WcposRequestConfig = {
		baseURL: 'https://shop.test/blog/wp-json/wcpos/v2/orders',
		url: '/42',
		wcposPreamble: {
			purpose: 'rest',
			accessToken: 'old',
			storeId: 7,
			site: { wp_api_url: 'https://shop.test/blog/?rest_route=/' },
		},
	};
	beforeEach(() => {
		jest.clearAllMocks();
		(http.request as jest.Mock).mockResolvedValue({ status: 200, data: {} });
	});
	it('composes orders plus /42 before rewriting, serializes once and strips metadata before IPC', async () => {
		const serialize = jest.fn(() => 'tags=a&tags=b');
		const { result } = renderHook(() => useHttpClient());
		await result.current.request({
			...canonical,
			params: { tags: ['a', 'b'] },
			paramsSerializer: { serialize },
		});
		const sent = (http.request as jest.Mock).mock.calls[0][0];
		const url = new URL(sent.url);
		expect(url.pathname).toBe('/blog/');
		expect(url.searchParams.get('rest_route')).toBe('/wcpos/v2/orders/42');
		expect(url.searchParams.getAll('tags')).toEqual(['a', 'b']);
		expect(url.searchParams.get('store_id')).toBe('7');
		expect(serialize).toHaveBeenCalledTimes(1);
		for (const key of ['wcposPreamble', 'baseURL', 'params', 'paramsSerializer']) {
			expect(sent).not.toHaveProperty(key);
		}
	});
	it('pins the normalized URL for Woo array, status and timestamp parameters', async () => {
		const { result } = renderHook(() => useHttpClient());
		await result.current.request({
			...canonical,
			params: {
				include: [1, 2],
				status: 'wc-completed',
				after: '2026-01-01T00:00:00',
				_fields: 'id,status',
			},
		});
		const sent = (http.request as jest.Mock).mock.calls[0][0];
		expect(sent.url).toBe(
			'https://shop.test/blog/?rest_route=%2Fwcpos%2Fv2%2Forders%2F42' +
				'&include%5B%5D=1&include%5B%5D=2&status=wc-completed&after=2026-01-01T00%3A00%3A00&_fields=id%2Cstatus' +
				`&wcpos_protocol=2&wcpos_client=web%2F${AppInfo.version}&store_id=7`
		);
	});
	it.each(['test', 'development'])(
		'preserves URLSearchParams on HEAD in %s',
		async (environment) => {
			const previous = process.env.NODE_ENV;
			const params = new URLSearchParams('tag=a&tag=b');
			try {
				process.env.NODE_ENV = environment;
				const { result } = renderHook(() => useHttpClient());
				await result.current.request({ ...canonical, method: 'HEAD', params });
				const sent = (http.request as jest.Mock).mock.calls[0][0];
				const query = new URL(sent.url).searchParams;
				expect(query.getAll('tag')).toEqual(['a', 'b']);
				expect(query.get('_method')).toBe('HEAD');
				expect(query.get('XDEBUG_SESSION')).toBe(environment === 'development' ? 'start' : null);
				expect(sent.headers).not.toHaveProperty('x-wcpos');
				expect(params.toString()).toBe('tag=a&tag=b');
			} finally {
				if (previous === undefined) delete process.env.NODE_ENV;
				else process.env.NODE_ENV = previous;
			}
		}
	);
	it.each([false, true])(
		'fresh-token retry starts from canonical config (query auth: %s)',
		async (query) => {
			const config = {
				...canonical,
				wcposPreamble: {
					...canonical.wcposPreamble!,
					site: { ...canonical.wcposPreamble!.site, use_jwt_as_param: query },
				},
			};
			const handler: HttpErrorHandler = {
				name: 'retry',
				canHandle: () => true,
				handle: async ({ originalConfig, retryRequest }) => {
					expect(originalConfig).toBe(config);
					expect(originalConfig.baseURL).toBe(canonical.baseURL);
					return retryRequest({
						...originalConfig,
						...(query
							? { params: { authorization: 'Bearer fresh' } }
							: { headers: { Authorization: 'Bearer fresh' } }),
					});
				},
			};
			(http.request as jest.Mock).mockRejectedValueOnce({ response: { status: 401 } });
			const { result } = renderHook(() => useHttpClient([handler]));
			await result.current.request(config);
			const sent = (http.request as jest.Mock).mock.calls[1][0];
			expect(
				query ? new URL(sent.url).searchParams.get('authorization') : sent.headers.authorization
			).toBe('Bearer fresh');
			expect(new URL(sent.url).searchParams.get('rest_route')).toBe('/wcpos/v2/orders/42');
		}
	);
	it('header opt-out preserves third-party URL handling and idempotency headers survive', async () => {
		const { result } = renderHook(() => useHttpClient());
		await result.current.post(
			'/image',
			{ value: 1 },
			{
				wcposHeaders: false,
				headers: { 'Idempotency-Key': 'key' },
				params: new URLSearchParams('size=2'),
			}
		);
		expect((http.request as jest.Mock).mock.calls[0][0]).toMatchObject({
			url: '/image',
			data: { value: 1 },
			params: new URLSearchParams('size=2'),
			headers: { 'idempotency-key': 'key' },
		});
		expect((http.request as jest.Mock).mock.calls[0][0].headers).not.toHaveProperty('x-wcpos');
		await result.current.request({ ...canonical, headers: { 'Idempotency-Key': 'key' } });
		expect((http.request as jest.Mock).mock.calls[1][0].headers['idempotency-key']).toBe('key');
	});
});
