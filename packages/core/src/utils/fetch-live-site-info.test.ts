import { fetchLiveSiteInfo } from './fetch-live-site-info';

const URL = 'https://store.example.test/wp-json/';

const httpAnswering = (response: { status: number; data?: unknown }) => {
	const get = jest.fn().mockResolvedValue(response);
	return { http: { get }, get };
};

const paramsOf = (get: jest.Mock, call = 0) =>
	(get.mock.calls[call]?.[1] as { params: Record<string, unknown> }).params;

describe('fetchLiveSiteInfo', () => {
	it('asks the REST index with wcpos=1 and a non-empty _wcpos_nocache', async () => {
		const { http, get } = httpAnswering({ status: 200, data: { wcpos_version: '2.0.1' } });

		await expect(fetchLiveSiteInfo(http, URL)).resolves.toEqual({ wcpos_version: '2.0.1' });

		expect(get).toHaveBeenCalledWith(URL, expect.anything());
		const params = paramsOf(get);
		expect(params.wcpos).toBe(1);
		expect(typeof params._wcpos_nocache).toBe('string');
		expect(params._wcpos_nocache).not.toBe('');
	});

	it('sends a different _wcpos_nocache on each call, so no cache can answer twice', async () => {
		const { http, get } = httpAnswering({ status: 200, data: {} });

		await fetchLiveSiteInfo(http, URL);
		await fetchLiveSiteInfo(http, URL);

		expect(paramsOf(get, 0)._wcpos_nocache).not.toBe(paramsOf(get, 1)._wcpos_nocache);
	});

	it('sends no headers, so the check stays unauthenticated and needs no CORS preflight', async () => {
		const { http, get } = httpAnswering({ status: 200, data: {} });

		await fetchLiveSiteInfo(http, URL);

		expect(get.mock.calls[0]?.[1]).not.toHaveProperty('headers');
	});

	it('throws, naming the status, when the store answers 500', async () => {
		const { http } = httpAnswering({ status: 500 });

		await expect(fetchLiveSiteInfo(http, URL)).rejects.toThrow('500');
	});

	it('returns null when the body is a string, not the index object', async () => {
		const { http } = httpAnswering({ status: 200, data: '<html>maintenance</html>' });

		await expect(fetchLiveSiteInfo(http, URL)).resolves.toBeNull();
	});
});
