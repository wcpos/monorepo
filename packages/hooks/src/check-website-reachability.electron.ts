import { http } from './use-http-client';

export async function checkWebsiteReachability(url: string): Promise<boolean> {
	for (const method of ['head', 'get'] as const) {
		try {
			await http.request({ url, method, timeout: 10000 });
			return true;
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'response' in error &&
				error.response !== undefined
			) {
				return true;
			}
		}
	}
	return false;
}
