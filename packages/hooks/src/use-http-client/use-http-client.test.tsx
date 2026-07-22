import { renderHook } from '@testing-library/react';

jest.mock('@wcpos/utils/logger', () => {
	const info = jest.fn();
	const error = jest.fn();
	return {
		getLogger: jest.fn(() => ({ debug: jest.fn(), info, warn: jest.fn(), error })),
		getDatabaseEpoch: jest.fn(() => 0),
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
};

describe('useHttpClient network audit logs', () => {
	beforeEach(() => jest.clearAllMocks());

	it('persists mutating responses with a sanitized searchable endpoint', async () => {
		(http.request as jest.Mock).mockResolvedValue({ status: 201, data: {} });
		const { result } = renderHook(() => useHttpClient());

		await result.current.post('/wc/v3/orders?authorization=secret', {});

		expect(loggerMock.__info).toHaveBeenCalledWith('HTTP request completed', {
			saveToDb: true,
			context: expect.objectContaining({
				method: 'POST',
				endpoint: '/wc/v3/orders',
				status: 201,
			}),
		});
	});

	it('persists transport failures without request data', async () => {
		const failure = Object.assign(new Error('network down'), { response: { status: 503 } });
		(http.request as jest.Mock).mockRejectedValue(failure);
		const { result } = renderHook(() => useHttpClient());

		await expect(result.current.get('/wc/v3/products?authorization=secret')).rejects.toBe(failure);

		expect(loggerMock.__error).toHaveBeenCalledWith('HTTP request failed', {
			saveToDb: true,
			context: expect.objectContaining({
				method: 'GET',
				endpoint: '/wc/v3/products',
				status: 503,
			}),
		});
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
});
