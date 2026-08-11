import { http } from './use-http-client';

export async function checkWebsiteReachability(url: string): Promise<boolean> {
	for (const method of ['head', 'get'] as const) {
		try {
			await http.request({ url, method, timeout: 10000 });
			return true;
		} catch (error) {
			const status =
				typeof error === 'object' && error !== null && 'response' in error
					? (error as { response?: { status?: number } }).response?.status
					: undefined;
			// A 4xx still proves the site can serve requests (HEAD rejected with 405,
			// auth walls). A 5xx means the site answered but cannot serve — a dead
			// backend behind a live proxy (nginx 502, Cloudflare 52x) must not read
			// as online, so fall through to GET / unreachable.
			if (typeof status === 'number' && status < 500) {
				return true;
			}
		}
	}
	return false;
}
