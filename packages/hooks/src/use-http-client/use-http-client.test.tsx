import { renderHook } from '@testing-library/react';

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
			context: expect.objectContaining({
				method: 'GET',
				endpoint: '/wc/v3/products',
				status: 503,
				errorCode: 'SYNC131',
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
			context: expect.objectContaining({
				errorCode: 'SYNC131',
				serverCode: 'merchant_plugin_unknown_error',
				triage: true,
			}),
		});
	});

	it('persists status zero for response-less transport failures', async () => {
		const failure = new Error('network down');
		(http.request as jest.Mock).mockRejectedValue(failure);
		const { result } = renderHook(() => useHttpClient());

		await expect(result.current.get('/wc/v3/products')).rejects.toBe(failure);

		expect(loggerMock.__error).toHaveBeenCalledWith('HTTP request failed', {
			context: expect.objectContaining({
				status: 0,
				errorCode: 'CLIENT999',
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
});
