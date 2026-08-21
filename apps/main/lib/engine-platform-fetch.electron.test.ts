import { platformEngineFetch } from './engine-platform-fetch.electron';

jest.resetModules();

jest.mock('@wcpos/utils/logger', () => ({ getLogger: () => ({ warn: jest.fn() }) }), {
	virtual: true,
});

jest.mock('@wcpos/hooks/use-http-client', () => ({
	http: jest.requireActual('@wcpos/hooks/use-http-client/http.electron').http,
}));

const invoke = jest.fn();

Object.defineProperty(window, 'ipcRenderer', {
	configurable: true,
	value: { invoke },
});

const success = (
	data: unknown,
	headers: Record<string, string> = {},
	status = 200,
	statusText = 'OK'
) => ({
	success: true,
	data,
	status,
	statusText,
	headers,
});

const failure = (status: number, data: unknown) => ({
	success: false,
	name: 'AxiosError',
	message: `Request failed with status code ${status}`,
	code: 'ERR_BAD_RESPONSE',
	response: {
		status,
		statusText: status === 304 ? 'Not Modified' : 'Error',
		data,
		headers: { etag: 'sequence-2' },
	},
});

describe('platformEngineFetch', () => {
	beforeEach(() => {
		invoke.mockReset();
	});

	it('passes GET request headers through the Electron HTTP bridge', async () => {
		invoke.mockResolvedValue(success({ ok: true }));
		const headers = new Headers({
			Authorization: 'Bearer token',
			'If-None-Match': 'sequence-1',
			'X-WCPOS': '1',
		});

		await platformEngineFetch('https://example.com/wp-json/wcpos/v1/orders', { headers });

		expect(invoke).toHaveBeenCalledWith('http-request', {
			type: 'request',
			requestId: expect.any(String),
			config: {
				url: 'https://example.com/wp-json/wcpos/v1/orders',
				method: 'GET',
				validateStatus: null,
				responseType: 'text',
				headers: {
					authorization: 'Bearer token',
					'if-none-match': 'sequence-1',
					'x-wcpos': '1',
				},
			},
		});
	});

	it('rejects a non-string request body without invoking the bridge', async () => {
		await expect(
			platformEngineFetch('https://example.com/orders', {
				method: 'POST',
				body: new URLSearchParams({ name: 'Desk' }),
			})
		).rejects.toThrow(new TypeError('engine fetch: unsupported body type'));
		expect(invoke).not.toHaveBeenCalled();
	});

	it('passes a POST string body as axios data', async () => {
		invoke.mockResolvedValue(success({ id: 42 }));

		await platformEngineFetch('https://example.com/orders', {
			method: 'POST',
			body: '{"name":"Desk"}',
		});

		expect(invoke).toHaveBeenCalledWith(
			'http-request',
			expect.objectContaining({
				config: expect.objectContaining({ data: '{"name":"Desk"}' }),
			})
		);
	});

	it('maps object data and response headers to a Response', async () => {
		invoke.mockResolvedValue(
			success(
				{ orders: [{ id: 42 }] },
				{ 'x-wp-total': '12', Date: 'Fri, 07 Aug 2026 12:00:00 GMT' }
			)
		);

		const response = await platformEngineFetch('https://example.com/orders');

		expect(await response.json()).toEqual({ orders: [{ id: 42 }] });
		expect(response.headers.get('X-WP-Total')).toBe('12');
		expect(response.headers.get('date')).toBe('Fri, 07 Aug 2026 12:00:00 GMT');
	});

	it('uses string response data verbatim', async () => {
		invoke.mockResolvedValue(success('plain response'));

		const response = await platformEngineFetch('https://example.com/orders');

		expect(await response.text()).toBe('plain response');
	});

	it('returns a bodyless 304 Response from the axios success path', async () => {
		invoke.mockResolvedValue(success('', { etag: 'sequence-2' }, 304, 'Not Modified'));

		const response = await platformEngineFetch('https://example.com/changes');

		expect(response.status).toBe(304);
		expect(response.body).toBeNull();
		expect(await response.text()).toBe('');
		expect(response.headers.get('ETag')).toBe('sequence-2');
	});

	it('returns a readable 404 Response from the axios success path', async () => {
		invoke.mockResolvedValue(success('{"code":"not_found"}', {}, 404, 'Not Found'));

		const response = await platformEngineFetch('https://example.com/orders/42');

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ code: 'not_found' });
	});

	it('returns a bodyless 304 Response from the axios error path', async () => {
		invoke.mockResolvedValue(failure(304, { ignored: true }));

		const response = await platformEngineFetch('https://example.com/changes');

		expect(response.status).toBe(304);
		expect(response.body).toBeNull();
		expect(await response.text()).toBe('');
		expect(response.headers.get('ETag')).toBe('sequence-2');
	});

	it.each([404, 500])(
		'returns a readable %i Response from the axios error path',
		async (status) => {
			invoke.mockResolvedValue(failure(status, { code: `status_${status}` }));

			const response = await platformEngineFetch('https://example.com/orders');

			expect(response.status).toBe(status);
			expect(await response.json()).toEqual({ code: `status_${status}` });
		}
	);

	it('normalizes an invalid error response status to a network TypeError', async () => {
		invoke.mockResolvedValue(failure(999, 'blocked'));

		await expect(platformEngineFetch('https://example.com/orders')).rejects.toMatchObject({
			name: 'TypeError',
			message: 'Network request failed',
		});
	});

	it('normalizes cancellation to an AbortError', async () => {
		invoke.mockResolvedValue({
			success: false,
			name: 'CanceledError',
			message: 'canceled',
			code: 'ERR_CANCELED',
		});

		await expect(platformEngineFetch('https://example.com/orders')).rejects.toMatchObject({
			name: 'AbortError',
		});
	});

	it('normalizes a network failure to a non-abort TypeError with the original cause', async () => {
		const originalError = new Error('socket closed');
		invoke.mockRejectedValue(originalError);

		try {
			await platformEngineFetch('https://example.com/orders');
			throw new Error('Expected request to reject');
		} catch (error) {
			expect(error).toBeInstanceOf(TypeError);
			expect(error).toMatchObject({
				name: 'TypeError',
				message: 'Network request failed',
				cause: originalError,
			});
			expect((error as Error).name).not.toBe('AbortError');
		}
	});
});
