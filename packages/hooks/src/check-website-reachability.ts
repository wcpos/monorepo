async function attempt(url: string, method: 'HEAD' | 'GET'): Promise<boolean> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

	try {
		await fetch(url, {
			method,
			mode: 'no-cors', // Avoid CORS issues for reachability check
			cache: 'no-store',
			signal: controller.signal,
		});
		// With no-cors, we can't read the status, but if it doesn't throw, the server responded
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
