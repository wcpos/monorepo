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
			.mockResolvedValueOnce({} as Response);

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'https://example.com',
			expect.objectContaining({ method: 'GET', mode: 'no-cors', cache: 'no-store' })
		);
	});

	it('returns false when HEAD and GET both fail', async () => {
		fetchMock.mockRejectedValue(new Error('network down'));

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not issue GET when HEAD succeeds', async () => {
		fetchMock.mockResolvedValue({} as Response);

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.com',
			expect.objectContaining({ method: 'HEAD' })
		);
	});

	it('treats an opaque cross-origin response as reachable', async () => {
		fetchMock.mockResolvedValue({ type: 'opaque', status: 0 } as Response);

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('returns false when the status is readable and 5xx on both attempts', async () => {
		// Same-origin probe (web bundle served from the store): a 502 error page
		// from a live proxy in front of a dead backend must not read as online.
		fetchMock.mockResolvedValue({ type: 'basic', status: 502 } as Response);

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('falls back to GET when only HEAD reports a 5xx', async () => {
		fetchMock
			.mockResolvedValueOnce({ type: 'basic', status: 500 } as Response)
			.mockResolvedValueOnce({ type: 'basic', status: 200 } as Response);

		await expect(checkWebsiteReachability('https://example.com')).resolves.toBe(true);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'https://example.com',
			expect.objectContaining({ method: 'GET' })
		);
	});
});
