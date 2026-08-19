import { pingProbeUrl } from './reachability-url';

async function attempt(url: string, method: 'HEAD' | 'GET'): Promise<boolean> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

	try {
		// `cors`, not `no-cors`, so the ping status is readable. The wcpos=1
		// marker must stay: released plugins only add cross-origin headers to
		// marked REST responses, including an old plugin's ping-route 404.
		const response = await fetch(url, {
			method,
			mode: 'cors',
			cache: 'no-store',
			signal: controller.signal,
		});
		// A 404 means an older plugin lacks the ping route, but still proves that
		// WordPress answered; a dead server cannot send it. Keep 5xx unreachable:
		// a live proxy can return one for a dead backend (bug #1135).
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
 * Probe the cheap WCPOS ping route. Some servers drop HEAD while serving GET normally.
 */
export async function checkWebsiteReachability(url: string): Promise<boolean> {
	const probeUrl = pingProbeUrl(url);
	return (await attempt(probeUrl, 'HEAD')) || attempt(probeUrl, 'GET');
}
