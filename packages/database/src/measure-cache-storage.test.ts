import { measureCacheStorage } from './measure-cache-storage';

describe('measureCacheStorage', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'caches', {
			configurable: true,
			value: {
				keys: jest.fn(async () => ['wcpos-images-v1', 'wcpos-images-v2', 'app-shell-v1']),
				open: jest.fn(async (name: string) => ({
					matchAll: jest.fn(async () =>
						name === 'wcpos-images-v1'
							? [
									{ type: 'basic', clone: () => ({ blob: async () => ({ size: 10 }) }) },
									{ type: 'opaque', clone: () => ({ blob: async () => ({ size: 999 }) }) },
								]
							: name === 'wcpos-images-v2'
								? [{ type: 'cors', clone: () => ({ blob: async () => ({ size: 15 }) }) }]
								: [{ type: 'basic', clone: () => ({ blob: async () => ({ size: 500 }) }) }]
					),
				})),
			},
		});
	});

	it('sums readable responses across caches without counting opaque bytes', async () => {
		await expect(measureCacheStorage()).resolves.toEqual({
			imageCacheBytes: 25,
			opaqueCacheEntries: 1,
		});
	});
});
