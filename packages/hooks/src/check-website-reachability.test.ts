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
});
