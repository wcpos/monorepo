/**
 * The app's image caches as written by use-image-attachment (web): versioned
 * names under this prefix. Other caches (e.g. a future service worker's app
 * shell) must NOT be summed here — the UI labels this number "Cached images".
 */
const IMAGE_CACHE_PREFIX = 'wcpos-images';

export async function measureCacheStorage(): Promise<{
	imageCacheBytes: number;
	opaqueCacheEntries: number;
} | null> {
	try {
		let imageCacheBytes = 0;
		let opaqueCacheEntries = 0;
		for (const name of await caches.keys()) {
			if (!name.startsWith(IMAGE_CACHE_PREFIX)) continue;
			for (const response of await (await caches.open(name)).matchAll()) {
				if (response.type === 'opaque') opaqueCacheEntries += 1;
				else imageCacheBytes += (await response.clone().blob()).size;
			}
		}
		return { imageCacheBytes, opaqueCacheEntries };
	} catch {
		return null;
	}
}
