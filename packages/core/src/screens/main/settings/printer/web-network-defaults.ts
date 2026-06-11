import type { VendorDefaults } from './dialog/use-printer-dialog-form';
import type { PrinterFormValues } from './schema';

type OriginProtocol = 'http:' | 'https:';

function getOriginProtocol(): OriginProtocol {
	return typeof window !== 'undefined' && window.location.protocol === 'https:'
		? 'https:'
		: 'http:';
}

export function deriveWebVendorDefaults(
	vendor: PrinterFormValues['vendor'],
	protocol: OriginProtocol = getOriginProtocol()
): VendorDefaults {
	const secure = protocol === 'https:';
	if (vendor === 'star') return { language: 'star-line', port: secure ? 443 : 80 };
	// Epson: 8043 on a secure origin, 8008 otherwise. 9100 is the "use default" sentinel.
	return { language: 'esc-pos', port: secure ? 8043 : 8008 };
}

/**
 * Map a port to one the browser can actually print to.
 *
 * Raw TCP 9100 (and a missing port) resolve to the vendor's web-protocol
 * default for this origin, so selecting a scan result never leaves the form
 * showing a port that differs from the endpoint the request will use.
 */
export function resolveWebPort(
	vendor: PrinterFormValues['vendor'],
	port: number | undefined,
	protocol: OriginProtocol = getOriginProtocol()
): number {
	if (port != null && port !== 9100) return port;
	return deriveWebVendorDefaults(vendor, protocol).port;
}

interface WebEndpoint {
	url: string;
	scheme: 'http' | 'https';
	port: number;
	/** e.g. "Epson ePOS" / "Star WebPRNT". */
	protocolLabel: string;
}

// Must stay in sync with NetworkAdapter / resolveStarWebPrntUrl in
// packages/printer/src/transport/network-adapter.web.ts.
function resolveWebEndpoint(
	vendor: PrinterFormValues['vendor'],
	address: string,
	port: number,
	protocol: OriginProtocol
): WebEndpoint | undefined {
	const ip = address.trim();
	if (!ip) return undefined;
	if (vendor === 'epson') {
		const resolvedPort = resolveWebPort(vendor, port, protocol);
		const scheme = resolvedPort === 8043 || resolvedPort === 443 ? 'https' : 'http';
		return {
			url: `${scheme}://${ip}:${resolvedPort}/cgi-bin/epos/service.cgi`,
			scheme,
			port: resolvedPort,
			protocolLabel: 'Epson ePOS',
		};
	}
	if (vendor === 'star') {
		const resolvedPort = resolveWebPort(vendor, port, protocol);
		const scheme = resolvedPort === 443 ? 'https' : 'http';
		return {
			url: `${scheme}://${ip}:${resolvedPort}/StarWebPRNT/SendMessage`,
			scheme,
			port: resolvedPort,
			protocolLabel: 'Star WebPRNT',
		};
	}
	return undefined;
}

export function deriveEndpointHint(
	vendor: PrinterFormValues['vendor'],
	address: string,
	port: number,
	protocol: OriginProtocol = getOriginProtocol()
): string | undefined {
	return resolveWebEndpoint(vendor, address, port, protocol)?.url;
}

/**
 * One-sentence explanation of why the derived endpoint uses HTTP or HTTPS,
 * shown under the endpoint preview.
 */
export function deriveEndpointExplanation(
	vendor: PrinterFormValues['vendor'],
	address: string,
	port: number,
	protocol: OriginProtocol = getOriginProtocol()
): string | undefined {
	const endpoint = resolveWebEndpoint(vendor, address, port, protocol);
	if (!endpoint) return undefined;
	if (endpoint.scheme === 'https') {
		const becauseSecure = protocol === 'https:' ? 'this page is secure and ' : '';
		return `Using ${endpoint.protocolLabel} over HTTPS because ${becauseSecure}port ${endpoint.port} is selected. The printer needs an SSL certificate this browser trusts.`;
	}
	return `Using ${endpoint.protocolLabel} over HTTP. Chrome or Edge may ask for permission to access your local network.`;
}
