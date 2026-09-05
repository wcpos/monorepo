import { withTargetAddressSpace } from './local-fetch';

// Manual vendor detection allows slower printers three seconds to answer.
const VENDOR_PROBE_TIMEOUT_MS = 3000;

/**
 * A vendor web-print endpoint that answered an HTTP probe.
 *
 * `port`/`protocol` describe the endpoint that actually responded, so callers
 * can configure the printer with a port the browser can genuinely reach —
 * web printing never uses raw TCP 9100.
 */
export interface ProbedEndpoint {
	vendor: 'epson' | 'star';
	port: number;
	protocol: 'http' | 'https';
}

/**
 * Probe a network host to auto-detect the printer vendor.
 *
 * Sends lightweight HTTP requests to the known Epson ePOS and Star
 * WebPRNT endpoints. Endpoint-level HTTP responses confirm the vendor,
 * including method rejections from printer endpoints that only accept POST.
 * Missing paths such as generic web-server 404s are not treated as matches.
 */
export async function probeVendor(host: string): Promise<'epson' | 'star' | null> {
	const endpoint = await probeVendorEndpoint(host);
	return endpoint?.vendor ?? null;
}

/**
 * Like {@link probeVendor}, but also reports which web endpoint responded.
 */
export async function probeVendorEndpoint(
	host: string,
	timeoutMs = VENDOR_PROBE_TIMEOUT_MS
): Promise<ProbedEndpoint | null> {
	const controller = new AbortController();
	// Share one deadline so Star fallback attempts cannot multiply scan time.
	const id = setTimeout(() => controller.abort(), timeoutMs);

	const probeEpson = async (): Promise<ProbedEndpoint | null> => {
		const url = `http://${host}:8008/cgi-bin/epos/service.cgi`;
		try {
			const response = await fetch(
				url,
				withTargetAddressSpace(url, { method: 'GET', signal: controller.signal })
			);
			return isEndpointPresent(response) ? { vendor: 'epson', port: 8008, protocol: 'http' } : null;
		} catch {
			return null;
		}
	};

	const probeStar = async (): Promise<ProbedEndpoint | null> => {
		try {
			const response = await fetch(`https://${host}/StarWebPRNT/SendMessage`, {
				method: 'GET',
				signal: controller.signal,
			});
			return isEndpointPresent(response) ? { vendor: 'star', port: 443, protocol: 'https' } : null;
		} catch {
			// Star printers on HTTPS with self-signed certs will fail in
			// browsers due to certificate rejection. Try HTTP as fallback —
			// port 80 is the WebPRNT default; 8008 covers the dev virtual
			// printer (VP_VENDOR=star VP_HTTP_PORT=8008).
			for (const port of [80, 8008]) {
				if (controller.signal.aborted) return null;
				const httpUrl = `http://${host}:${port}/StarWebPRNT/SendMessage`;
				try {
					const response = await fetch(
						httpUrl,
						withTargetAddressSpace(httpUrl, { method: 'GET', signal: controller.signal })
					);
					if (isEndpointPresent(response)) {
						return { vendor: 'star', port, protocol: 'http' };
					}
				} catch {
					// keep trying the next HTTP port
				}
			}
			return null;
		}
	};

	try {
		const [epson, star] = await Promise.all([probeEpson(), probeStar()]);
		return epson ?? star ?? null;
	} finally {
		clearTimeout(id);
	}
}

function isEndpointPresent(response: Response): boolean {
	return response.status !== 404 && response.status < 500;
}
