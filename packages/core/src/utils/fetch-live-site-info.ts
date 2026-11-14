import { CACHE_BUSTER_PARAM, cacheBusterValue } from '@wcpos/utils/request-preamble';

interface SiteInfoHttp {
	get: (
		url: string,
		config?: object
	) => Promise<{ status: number; statusText?: string; data?: unknown }>;
}

/** The store answered the REST index with a non-2xx status. */
export class SiteInfoStatusError extends Error {
	constructor(
		public readonly status: number | undefined,
		public readonly statusText?: string
	) {
		super(`Invalid response status: ${status}`);
		this.name = 'SiteInfoStatusError';
	}
}

/**
 * The store's REST index (`?wcpos=1`): WP, WC and WCPOS versions and the license, as the store
 * reports them now. Returns `null` when the body is not a plain object; network errors propagate.
 *
 * The cache-buster is there because the index is a fixed URL: a browser cache, page cache or CDN
 * that served a 1.x answer to it kept the AUTH331 plugin gate up on a store running 2.0.1. A
 * unique key is never a hit.
 *
 * The config carries no `headers` on purpose: an `Authorization` or custom header would make the
 * request authenticated and, cross-origin, trigger a CORS preflight.
 */
export async function fetchLiveSiteInfo(
	http: SiteInfoHttp,
	wpApiUrl: string
): Promise<Record<string, unknown> | null> {
	const response = await http.get(wpApiUrl, {
		params: { wcpos: 1, [CACHE_BUSTER_PARAM]: cacheBusterValue() },
	});
	if (!response || response.status < 200 || response.status >= 300) {
		throw new SiteInfoStatusError(response?.status, response?.statusText);
	}
	const data = response.data;
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	return data as Record<string, unknown>;
}
