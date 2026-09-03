import { withTargetAddressSpace } from '../utils/local-fetch';
import { probeVendorEndpoint } from '../utils/probe-vendor';
export async function postEposFetch(
	host: string,
	port: number,
	path: string,
	xml: string,
	timeoutMs: number,
	annotate = false
) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const protocol = port === 443 || port === 8043 ? 'https' : 'http';
	const url = `${protocol}://${host}:${port}${path}`;
	const init = {
		method: 'POST',
		headers: { 'Content-Type': 'text/xml' },
		body: xml,
		signal: controller.signal,
	};
	try {
		const response = await fetch(url, annotate ? withTargetAddressSpace(url, init) : init);
		return { status: response.status, body: await response.text() };
	} finally {
		clearTimeout(timer);
	}
}
export async function fetchStar(host: string) {
	const endpoint = await probeVendorEndpoint(host);
	return endpoint?.vendor === 'star' ? endpoint : null;
}
