import { checkWebsiteReachability } from './check-website-reachability';

describe('checkWebsiteReachability', () => {
	const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

	beforeEach(() => {
		globalThis.fetch = fetchMock;
		fetchMock.mockReset();
	});

	it('falls back to GET when HEAD fails', async () => {
		fetchMock
			.mockRejectedValueOnce(new Error('HEAD blocked'))
			.mockResolvedValueOnce({ status: 200 } as Response);

		await expect(checkWebsiteReachability('https://example.com/wp-json/')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'https://example.com/wp-json/wcpos/v2/ping?wcpos=1',
			expect.objectContaining({ method: 'GET', mode: 'cors', cache: 'no-store' })
		);
	});

	it('returns false when HEAD and GET both fail', async () => {
		fetchMock.mockRejectedValue(new Error('network down'));

		await expect(checkWebsiteReachability('https://example.com/wp-json/')).resolves.toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not issue GET when HEAD succeeds', async () => {
		fetchMock.mockResolvedValue({ status: 200 } as Response);

		await expect(checkWebsiteReachability('https://example.com/wp-json/')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.com/wp-json/wcpos/v2/ping?wcpos=1',
			expect.objectContaining({ method: 'HEAD' })
		);
	});

	it('probes the ping route for plain permalinks', async () => {
		fetchMock.mockResolvedValue({ status: 200 } as Response);

		await expect(checkWebsiteReachability('https://example.com/?rest_route=/')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.com/?rest_route=/wcpos/v2/ping&wcpos=1',
			expect.objectContaining({ method: 'HEAD' })
		);
	});

	it('treats a 404 from an older plugin as reachable', async () => {
		fetchMock.mockResolvedValue({ status: 404 } as Response);

		await expect(checkWebsiteReachability('https://example.com/wp-json/')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('treats a rejected cross-origin probe as unreachable', async () => {
		// Under cors mode a 5xx error page without CORS headers (proxy up,
		// backend dead) rejects the fetch — that must read as NOT reachable.
		// The marked ping probe is readable on a working deployment, so a
		// rejection here is never a false alarm.
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

		await expect(checkWebsiteReachability('https://example.com/wp-json/')).resolves.toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('returns false when the status is readable and 5xx on both attempts', async () => {
		// A 502 error page WITH readable status (same-origin, or a proxy that
		// reflects CORS headers) from a live proxy in front of a dead backend
		// must not read as online.
		fetchMock.mockResolvedValue({ type: 'basic', status: 502 } as Response);

		await expect(checkWebsiteReachability('https://example.com/wp-json/')).resolves.toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('falls back to GET when only HEAD reports a 5xx', async () => {
		fetchMock
			.mockResolvedValueOnce({ type: 'basic', status: 500 } as Response)
			.mockResolvedValueOnce({ type: 'basic', status: 200 } as Response);

		await expect(checkWebsiteReachability('https://example.com/wp-json/')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'https://example.com/wp-json/wcpos/v2/ping?wcpos=1',
			expect.objectContaining({ method: 'GET' })
		);
	});
});
