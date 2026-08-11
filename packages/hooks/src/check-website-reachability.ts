async function attempt(url: string, method: 'HEAD' | 'GET'): Promise<boolean> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

	try {
		const response = await fetch(url, {
			method,
			mode: 'no-cors', // Avoid CORS issues for reachability check
			cache: 'no-store',
			signal: controller.signal,
		});
		// Cross-origin no-cors responses are opaque (status 0) — the server
		// responded, which is all we can know, so count it as reachable. When the
		// status IS readable (same-origin, e.g. the web bundle served from the
		// store itself), a 5xx means the site answered but cannot serve — a dead
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
 * Check if the website is reachable. Some servers drop HEAD while serving GET normally.
 */
export async function checkWebsiteReachability(url: string): Promise<boolean> {
	return (await attempt(url, 'HEAD')) || attempt(url, 'GET');
}
