import { printerLogger } from '../logger';
import { withTargetAddressSpace } from './local-fetch';

// Manual vendor detection allows slower printers three seconds to answer.
const VENDOR_PROBE_TIMEOUT_MS = 3000;

/**
 * A vendor web-print endpoint that answered an HTTP probe.
 *
 * `port`/`protocol` describe the endpoint that actually responded, so callers
 * can configure the printer with a port the browser can genuinely reach —
 * web printing never uses raw TCP 9100. `status` is the HTTP status that
 * decided it, which identify copies onto the port it reports.
 */
export interface ProbedEndpoint {
	vendor: 'epson' | 'star';
	port: number;
	protocol: 'http' | 'https';
	status: number;
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
	// Every status this host answered with, so an undecided probe says what it saw.
	const statusesSeen: string[] = [];

	const probeEpson = async (): Promise<ProbedEndpoint | null> => {
		const url = `http://${host}:8008/cgi-bin/epos/service.cgi`;
		try {
			const response = await fetch(
				url,
				withTargetAddressSpace(url, { method: 'GET', signal: controller.signal })
			);
			statusesSeen.push(`epos-print:8008=${response.status}`);
			return isEndpointPresent(response)
				? { vendor: 'epson', port: 8008, protocol: 'http', status: response.status }
				: null;
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
			statusesSeen.push(`webprnt:443=${response.status}`);
			return isEndpointPresent(response)
				? { vendor: 'star', port: 443, protocol: 'https', status: response.status }
				: null;
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
					statusesSeen.push(`webprnt:${port}=${response.status}`);
					if (isEndpointPresent(response)) {
						return { vendor: 'star', port, protocol: 'http', status: response.status };
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
		const endpoint = epson ?? star ?? null;
		if (endpoint) {
			printerLogger.debug('Vendor probe decided', {
				context: {
					host,
					vendor: endpoint.vendor,
					port: endpoint.port,
					protocol: endpoint.protocol,
					status: endpoint.status,
				},
			});
		} else {
			printerLogger.debug('Vendor probe undecided', { context: { host, statusesSeen } });
		}
		return endpoint;
	} finally {
		clearTimeout(id);
	}
}

function isEndpointPresent(response: Response): boolean {
	return response.status !== 404 && response.status < 500;
}
