import { renderHook } from '@testing-library/react';

import { AppInfo } from '@wcpos/utils/app-info';

jest.mock('@wcpos/utils/logger', () => {
	const info = jest.fn();
	const error = jest.fn();
	const mapExceptionToCode = jest.fn(() => ({
		code: 'CLIENT999',
		context: { name: 'Error', message: 'network down' },
	}));
	return {
		getLogger: jest.fn(() => ({ debug: jest.fn(), info, warn: jest.fn(), error })),
		getDatabaseEpoch: jest.fn(() => 0),
		mapExceptionToCode,
		__info: info,
		__error: error,
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
import { useHttpClient } from './use-http-client';
/* eslint-enable import/first */

const loggerMock = jest.requireMock('@wcpos/utils/logger') as {
	__info: jest.Mock;
	__error: jest.Mock;
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
		expect(config.headers['X-WCPOS']).toBe(1);
		expect(config.headers).not.toHaveProperty('X-WCPOS-Protocol');
		expect(config.headers).not.toHaveProperty('X-WCPOS-Client');
		expect(config.headers).not.toHaveProperty('User-Agent');
	});

	it('stamps protocol and client headers outside web', async () => {
		const webPlatform = AppInfo.platform;
		AppInfo.platform = 'electron';
		(http.request as jest.Mock).mockResolvedValue({ status: 200, data: {} });
		const { result } = renderHook(() => useHttpClient());

		try {
			await result.current.get('https://example.com/wp-json/wcpos/v2/products');

			const config = (http.request as jest.Mock).mock.calls[0][0];
			expect(config.headers['X-WCPOS-Protocol']).toBe('2');
			expect(config.headers['X-WCPOS-Client']).toBe(`electron/${AppInfo.version}`);
		} finally {
			AppInfo.platform = webPlatform;
		}
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

		expect(loggerMock.__error).toHaveBeenCalledWith('HTTP request failed', {
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

		expect(loggerMock.__error).toHaveBeenCalledWith('HTTP request failed', {
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

		expect(loggerMock.__error).toHaveBeenCalledWith('HTTP request failed', {
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
