import { http } from './use-http-client';
import { checkWebsiteReachability } from './check-website-reachability.electron';

jest.mock('./use-http-client', () => ({
	http: { request: jest.fn() },
}));

const request = jest.mocked(http.request);

describe('checkWebsiteReachability', () => {
	beforeEach(() => {
		request.mockReset();
	});

	it('returns true when the HEAD request succeeds and sends the timeout', async () => {
		request.mockResolvedValue({ data: null, status: 200 });

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
		expect(request).toHaveBeenCalledWith({
			url: 'https://example.com',
			method: 'head',
			timeout: 10000,
		});
	});

	it('returns true when the server responds with a 4xx error', async () => {
		request.mockRejectedValue({ response: { status: 405 } });

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('returns false when the server responds 5xx to both HEAD and GET', async () => {
		// A dead backend behind a live proxy (nginx 502, Cloudflare 52x) still
		// answers with HTTP — that must NOT count as reachable or the online dot
		// stays green while every real request fails.
		request.mockRejectedValue({ response: { status: 502 } });

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(false);
		expect(request).toHaveBeenCalledTimes(2);
	});

	it('falls back to GET when only HEAD gets the 5xx', async () => {
		request
			.mockRejectedValueOnce({ response: { status: 500 } })
			.mockResolvedValueOnce({ data: null, status: 200 });

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
		expect(request).toHaveBeenNthCalledWith(2, {
			url: 'https://example.com',
			method: 'get',
			timeout: 10000,
		});
	});

	it('falls back to GET after a HEAD network error', async () => {
		request.mockRejectedValueOnce(new Error('HEAD blocked')).mockResolvedValueOnce({
			data: null,
			status: 200,
		});

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
		expect(request).toHaveBeenNthCalledWith(2, {
			url: 'https://example.com',
			method: 'get',
			timeout: 10000,
		});
	});

	it('returns false when HEAD and GET both have a network error', async () => {
		request.mockRejectedValue(new Error('Network Error'));

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(false);
		expect(request).toHaveBeenCalledTimes(2);
	});
});
