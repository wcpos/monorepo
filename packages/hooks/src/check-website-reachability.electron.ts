import { http } from './use-http-client';

export async function checkWebsiteReachability(url: string): Promise<boolean> {
	try {
		await http.request({ url, method: 'head', timeout: 10000 });
		return true;
	} catch (error) {
		return (
			typeof error === 'object' &&
			error !== null &&
			'response' in error &&
			error.response !== undefined
		);
	}
}
