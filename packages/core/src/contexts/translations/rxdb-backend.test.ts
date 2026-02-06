import { RxDBBackend, TRANSLATION_VERSION } from './rxdb-backend';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function createBackend(options: { translationsState?: any } = {}) {
	const backend = new RxDBBackend();
	const services = {
		resourceStore: { addResourceBundle: jest.fn() },
	};
	backend.init(services, {
		translationsState: options.translationsState ?? null,
	});
	return { backend, services };
}

beforeEach(() => {
	mockFetch.mockReset();
});

describe('RxDBBackend', () => {
	describe('static properties', () => {
		it('has type "backend"', () => {
			expect(RxDBBackend.type).toBe('backend');
			expect(new RxDBBackend().type).toBe('backend');
		});
	});

	describe('buildUrl', () => {
		it('constructs the correct jsDelivr CDN URL with monorepo/ path', () => {
			const { backend } = createBackend();
			const url = backend.buildUrl('fr_FR', 'core');
			expect(url).toBe(
				`https://cdn.jsdelivr.net/gh/wcpos/translations@${TRANSLATION_VERSION}/translations/js/fr_FR/monorepo/core.json`
			);
		});

		it('handles different namespaces', () => {
			const { backend } = createBackend();
			const url = backend.buildUrl('ja', 'electron');
			expect(url).toBe(
				`https://cdn.jsdelivr.net/gh/wcpos/translations@${TRANSLATION_VERSION}/translations/js/ja/monorepo/electron.json`
			);
		});
	});

	describe('read — cache behavior', () => {
		it('returns cached translations when available', () => {
			const cached = { Hello: 'Bonjour', Goodbye: 'Au revoir' };
			const translationsState = { fr_FR: cached };
			const { backend } = createBackend({ translationsState });

			mockFetch.mockResolvedValue({ ok: false });

			const callback = jest.fn();
			backend.read('fr_FR', 'core', callback);

			expect(callback).toHaveBeenCalledWith(null, cached);
		});

		it('calls callback with null (no data) when cache is empty', () => {
			const { backend } = createBackend({ translationsState: {} });

			mockFetch.mockResolvedValue({ ok: false });

			const callback = jest.fn();
			backend.read('fr_FR', 'core', callback);

			expect(callback).toHaveBeenCalledWith(null);
		});

		it('calls callback with null when translationsState is null', () => {
			const { backend } = createBackend({ translationsState: null });

			mockFetch.mockResolvedValue({ ok: false });

			const callback = jest.fn();
			backend.read('fr_FR', 'core', callback);

			expect(callback).toHaveBeenCalledWith(null);
		});
	});

	describe('read — fetch behavior', () => {
		it('fetches from the correct CDN URL', () => {
			const { backend } = createBackend({ translationsState: {} });

			mockFetch.mockResolvedValue({ ok: false });

			backend.read('fr_FR', 'core', jest.fn());

			expect(mockFetch).toHaveBeenCalledWith(
				`https://cdn.jsdelivr.net/gh/wcpos/translations@${TRANSLATION_VERSION}/translations/js/fr_FR/monorepo/core.json`
			);
		});

		it('updates cache and resource store when fetch returns new data', async () => {
			const translationsState = {
				set: jest.fn(),
			};
			const { backend, services } = createBackend({ translationsState });

			const freshData = { Hello: 'Hola', Goodbye: 'Adiós' };
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(freshData),
			});

			backend.read('es_ES', 'core', jest.fn());

			// Let the fetch promise chain resolve
			await new Promise((r) => setTimeout(r, 0));

			expect(translationsState.set).toHaveBeenCalledWith('es_ES', expect.any(Function));
			expect(services.resourceStore.addResourceBundle).toHaveBeenCalledWith(
				'es_ES',
				'core',
				freshData,
				true,
				true
			);
		});

		it('skips cache update when fetched data matches current cache', async () => {
			const data = { Hello: 'Bonjour' };
			const translationsState = {
				fr_FR: data,
				set: jest.fn(),
			};
			const { backend, services } = createBackend({ translationsState });

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(data),
			});

			backend.read('fr_FR', 'core', jest.fn());

			await new Promise((r) => setTimeout(r, 0));

			expect(translationsState.set).not.toHaveBeenCalled();
			// Resource store is still updated to ensure i18next has the data
			expect(services.resourceStore.addResourceBundle).toHaveBeenCalled();
		});

		it('ignores empty translation responses', async () => {
			const translationsState = { set: jest.fn() };
			const { backend, services } = createBackend({ translationsState });

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({}),
			});

			backend.read('fr_FR', 'core', jest.fn());

			await new Promise((r) => setTimeout(r, 0));

			expect(translationsState.set).not.toHaveBeenCalled();
			expect(services.resourceStore.addResourceBundle).not.toHaveBeenCalled();
		});

		it('handles non-ok responses gracefully', async () => {
			const translationsState = { set: jest.fn() };
			const { backend, services } = createBackend({ translationsState });

			mockFetch.mockResolvedValue({ ok: false, status: 404 });

			backend.read('xx_XX', 'core', jest.fn());

			await new Promise((r) => setTimeout(r, 0));

			expect(translationsState.set).not.toHaveBeenCalled();
			expect(services.resourceStore.addResourceBundle).not.toHaveBeenCalled();
		});

		it('handles fetch network errors gracefully', async () => {
			const translationsState = { set: jest.fn() };
			const { backend, services } = createBackend({ translationsState });

			mockFetch.mockRejectedValue(new Error('Network error'));

			const callback = jest.fn();
			backend.read('fr_FR', 'core', callback);

			await new Promise((r) => setTimeout(r, 0));

			// Should not throw, just silently fail
			expect(translationsState.set).not.toHaveBeenCalled();
			expect(services.resourceStore.addResourceBundle).not.toHaveBeenCalled();
		});
	});
});
