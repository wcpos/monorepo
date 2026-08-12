async function attempt(url: string, method: 'HEAD' | 'GET'): Promise<boolean> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

	try {
		// `cors`, not `no-cors`: the probe targets the store's wp-json root, and a
		// web deployment cannot function at all unless that endpoint answers
		// cross-origin requests — every data call the app makes is one. Under
		// no-cors every cross-origin response was opaque (status 0), so a live
		// proxy 502-ing for a dead backend read as "reachable" and the header dot
		// stayed green — the #1135 bug, still alive on web (caught live 2026-08-12
		// by e2e/server-down-1135.live.spec.ts). With cors the status is readable
		// wherever the app can work, and a 5xx error page without CORS headers
		// rejects — both correctly non-green.
		const response = await fetch(url, {
			method,
			mode: 'cors',
			cache: 'no-store',
			signal: controller.signal,
		});
		// A readable 5xx means the site answered but cannot serve — a dead
		// backend behind a live proxy must not read as online.
		if (typeof response.status === 'number' && response.status >= 500) {
			return false;
		}
		return true;
	} catch {
		return false;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * The plugin only sends `Access-Control-Allow-Origin` on WCPOS-shaped requests
 * (verified live on dev-next 2026-08-12: bare `/wp-json/` has no allow-origin;
 * `/wp-json/?wcpos=1` answers `*` for GET and HEAD alike). Every data call the
 * app makes carries this marker, so probing with it keeps the reachability
 * check inside exactly the compatibility envelope the app itself needs.
 * Plain-permalink stores probe `/?rest_route=/`, so respect an existing query.
 */
function withWcposMarker(url: string): string {
	return url.includes('?') ? `${url}&wcpos=1` : `${url}?wcpos=1`;
}

/**
 * Check if the website is reachable. Some servers drop HEAD while serving GET normally.
 */
export async function checkWebsiteReachability(url: string): Promise<boolean> {
	const probeUrl = withWcposMarker(url);
	return (await attempt(probeUrl, 'HEAD')) || attempt(probeUrl, 'GET');
}
