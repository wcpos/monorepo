/**
 * Check if the website is reachable by making a HEAD request
 */
export async function checkWebsiteReachability(url: string): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

		await fetch(url, {
			method: 'HEAD',
			mode: 'no-cors', // Avoid CORS issues for reachability check
			cache: 'no-store',
			signal: controller.signal,
		});

		clearTimeout(timeoutId);
		// With no-cors, we can't read the status, but if it doesn't throw, the server responded
		return true;
	} catch {
		return false;
	}
}
