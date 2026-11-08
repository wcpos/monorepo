import { RxDBBackend } from './rxdb-backend';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Both lanes run every case: a pinned CalVer tag and the rolling `next` branch ref.
const PINNED = '2026.11.12';
const ROLLING = 'next';

/** A cache port over a plain record; `set` stores what it is given, as the app's port does. */
function createCache(entries: Record<string, unknown> = {}) {
	const store = { ...entries };
	return {
		store,
		get: (key: string) => store[key],
		set: jest.fn((key: string, catalogue: Record<string, string>, _cached: unknown) => {
			store[key] = catalogue;
		}),
	};
}

function createBackend(cache = createCache(), { rolling = false }: { rolling?: boolean } = {}) {
	const backend = new RxDBBackend();
	backend.init({}, { version: rolling ? ROLLING : PINNED, rolling, cache });
	return backend;
}

beforeEach(() => {
	mockFetch.mockReset();
});

function mockFetchResponse(data: Record<string, string> | null) {
	if (data === null) {
		return mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
	}
	return mockFetch.mockResolvedValueOnce({
		ok: true,
		json: () => Promise.resolve(data),
	});
}
describe('RxDBBackend', () => {
	describe('static properties', () => {
		it('has type "backend"', () => {
			expect(RxDBBackend.type).toBe('backend');
			expect(new RxDBBackend().type).toBe('backend');
		});
	});

	describe('buildUrl', () => {
		it.each([PINNED, ROLLING])('constructs the correct jsDelivr CDN URL for %s', (version) => {
			const backend = createBackend(createCache(), { rolling: version === ROLLING });
			const url = backend.buildUrl('fr_CA', 'core');
			expect(url).toBe(
				`https://cdn.jsdelivr.net/gh/wcpos/translations@${version}/translations/js/fr_CA/monorepo/core.json`
			);
		});
	});

	describe('read — cache behavior', () => {
		it('returns cached translations immediately without fetching', () => {
			const cached = { 'pos_cart.add_to_cart': 'Ajouter au panier' };
			const backend = createBackend(createCache({ [`fr_CA@${PINNED}`]: cached }));

			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			expect(callback).toHaveBeenCalledWith(null, cached);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('returns cached falsy translations without fetching', () => {
			const cached = '';
			const backend = createBackend(createCache({ [`fr_CA@${PINNED}`]: cached }));

			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			expect(callback).toHaveBeenCalledWith(null, cached);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('fetches fresh translations even when the rolling version is cached', async () => {
			const cached = { 'common.cancel': 'Ancienne traduction' };
			const freshData = { 'common.cancel': 'Nouvelle traduction' };
			mockFetchResponse(freshData);
			const cache = createCache({ [`fr_CA@${ROLLING}`]: cached });
			const backend = createBackend(cache, { rolling: true });
			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			expect(callback).not.toHaveBeenCalled();
			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith(null, freshData);
			expect(cache.set).toHaveBeenCalledWith(`fr_CA@${ROLLING}`, freshData, cached);
		});

		// The cache skips an unchanged catalogue by comparing it with this snapshot; the skip
		// itself is pinned in packages/query/tests/user-db/state.test.ts.
		it('hands the cache the fetch-start snapshot when the rolling fetch returns what is stored', async () => {
			const cached = { 'common.cancel': 'Annuler' };
			mockFetchResponse({ ...cached });
			const cache = createCache({ [`fr_CA@${ROLLING}`]: cached });
			const backend = createBackend(cache, { rolling: true });
			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith(null, cached);
			expect(cache.set).toHaveBeenCalledTimes(1);
			expect(cache.set.mock.calls[0][2]).toBe(cached);
		});

		it('fetches a rolling ref once per backend and then serves the cache', async () => {
			const freshData = { 'common.cancel': 'Nouvelle traduction' };
			mockFetchResponse(freshData);
			const cache = createCache();
			const backend = createBackend(cache, { rolling: true });
			const first = jest.fn();
			backend.read('fr_CA', 'core', first);
			await new Promise((r) => setTimeout(r, 0));
			expect(first).toHaveBeenCalledWith(null, freshData);
			expect(cache.set).toHaveBeenCalledTimes(1);

			// The write wakes the app state; the read it provokes must not fetch or write again.
			const second = jest.fn();
			backend.read('fr_CA', 'core', second);
			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledWith(null, freshData);
			expect(cache.set).toHaveBeenCalledTimes(1);
		});

		it.each(['network error', 'missing translations'])(
			'falls back to the rolling cache on %s',
			async (failure) => {
				const cached = { 'common.cancel': 'Annuler' };
				if (failure === 'network error') {
					mockFetch.mockRejectedValue(new Error('Network error'));
				} else {
					mockFetchResponse(null);
					mockFetchResponse(null);
				}
				const cache = createCache({ [`fr_CA@${ROLLING}`]: cached });
				const backend = createBackend(cache, { rolling: true });
				const callback = jest.fn();
				backend.read('fr_CA', 'core', callback);

				await new Promise((r) => setTimeout(r, 0));

				expect(mockFetch).toHaveBeenCalledTimes(failure === 'network error' ? 1 : 2);
				expect(callback).toHaveBeenCalledTimes(1);
				expect(callback).toHaveBeenCalledWith(null, cached);
				expect(cache.set).not.toHaveBeenCalled();
			}
		);

		it('ignores stale unversioned cache entries and refetches translations', async () => {
			const staleCached = { 'common.cancel': 'Ancienne traduction' };
			const freshData = { 'common.cancel': 'Nouvelle traduction' };
			mockFetchResponse(freshData);

			const cache = createCache({ fr_CA: staleCached });
			const backend = createBackend(cache);

			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith(null, freshData);
			expect(callback).not.toHaveBeenCalledWith(null, staleCached);
			expect(cache.set).toHaveBeenCalledWith(`fr_CA@${PINNED}`, freshData, undefined);
		});
	});

	describe('read — regional locale fallback chain', () => {
		it('uses exact locale (fr_CA) when CDN has it', async () => {
			const frCAData = { 'common.cancel': 'Annuler (CA)' };
			mockFetchResponse(frCAData);

			const cache = createCache();
			const backend = createBackend(cache);

			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/fr_CA/monorepo/core.json'));
			expect(callback).toHaveBeenCalledWith(null, frCAData);
			expect(cache.set).toHaveBeenCalledWith(`fr_CA@${PINNED}`, frCAData, undefined);
		});

		it('falls back to base language (fr) when regional locale (fr_CA) is empty', async () => {
			mockFetchResponse({}); // fr_CA returns empty
			const frData = { 'common.cancel': 'Annuler' };
			mockFetchResponse(frData); // fr returns data

			const cache = createCache();
			const backend = createBackend(cache);

			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining('/fr_CA/monorepo/core.json')
			);
			expect(mockFetch).toHaveBeenNthCalledWith(
				2,
				expect.stringContaining('/fr/monorepo/core.json')
			);
			expect(callback).toHaveBeenCalledWith(null, frData);
			// Caches under original language + version key so we don't re-fetch fr_CA next time
			expect(cache.set).toHaveBeenCalledWith(`fr_CA@${PINNED}`, frData, undefined);
		});

		it('falls back to base language (fr) when regional locale (fr_CA) returns 404', async () => {
			mockFetchResponse(null); // fr_CA 404
			const frData = { 'common.cancel': 'Annuler' };
			mockFetchResponse(frData); // fr returns data

			const cache = createCache();
			const backend = createBackend(cache);

			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(callback).toHaveBeenCalledWith(null, frData);
		});

		it('returns empty when both regional and base language fail (triggers en fallback)', async () => {
			mockFetchResponse(null); // fr_CA 404
			mockFetchResponse(null); // fr 404

			const cache = createCache();
			const backend = createBackend(cache);

			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledTimes(2);
			// Returns empty object — i18next will use bundled en.json fallback
			expect(callback).toHaveBeenCalledWith(null, {});
			expect(cache.set).not.toHaveBeenCalled();
		});

		it('returns empty without base fallback for non-regional locales (e.g. "xx")', async () => {
			mockFetchResponse(null); // xx 404

			const cache = createCache();
			const backend = createBackend(cache);

			const callback = jest.fn();
			backend.read('xx', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			// No base language to try, only one fetch
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith(null, {});
		});
	});

	describe('read — error handling', () => {
		it('returns empty on network error (triggers en fallback)', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'));

			const cache = createCache();
			const backend = createBackend(cache);

			const callback = jest.fn();
			backend.read('fr_CA', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			expect(callback).toHaveBeenCalledWith(null, {});
			expect(cache.set).not.toHaveBeenCalled();
		});
	});
});
