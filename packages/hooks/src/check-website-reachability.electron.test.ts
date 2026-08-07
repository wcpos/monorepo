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

	it('returns true when the server responds with an HTTP error', async () => {
		request.mockRejectedValue({ response: { status: 503 } });

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
	});

	it('returns false for a network error', async () => {
		request.mockRejectedValue(new Error('Network Error'));

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(false);
	});
});
