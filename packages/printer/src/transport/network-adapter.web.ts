import { EpsonEposAdapter } from './epson-epos-adapter';
import { StarWebPrntAdapter } from './star-webprnt-adapter';

import type { PrinterTransport, PrintRawOptions } from '../types';

/**
 * Web network adapter — delegates to vendor-specific HTTP adapters.
 *
 * Browsers cannot open raw TCP sockets, so network printing on web
 * uses vendor-specific HTTP/HTTPS endpoints built into the printer:
 *
 * - **Epson** printers expose a SOAP endpoint (`/cgi-bin/epos/service.cgi`)
 *   that accepts epos-print XML commands via HTTP POST.
 * - **Star** printers expose an HTTP endpoint (`/StarWebPRNT/SendMessage`)
 *   that accepts XML-wrapped print commands via POST.
 *
 * Both approaches may require accepting a self-signed certificate
 * if the printer uses HTTPS.
 */
export class NetworkAdapter implements PrinterTransport {
	readonly name = 'network-web';
	private delegate: PrinterTransport;

	constructor(host: string, port: number = 9100, vendor?: string) {
		switch (vendor) {
			case 'epson':
				{
					const secureOrigin =
						typeof window !== 'undefined' && window.location.protocol === 'https:';
					const epsonPort = port === 9100 ? (secureOrigin ? 8043 : 8008) : port;
					this.delegate = new EpsonEposAdapter(host, epsonPort);
				}
				break;
			case 'star':
				{
					this.delegate = new StarWebPrntAdapter(resolveStarWebPrntUrl(host, port));
				}
				break;
			default:
				throw new Error(
					'Direct network printing in web browsers requires a vendor-specific protocol. ' +
						'Set your printer vendor to "Epson" or "Star" in printer settings, ' +
						'or use the system print dialog instead.'
				);
		}
	}

	async printRaw(data: Uint8Array, options?: PrintRawOptions): Promise<void> {
		return this.delegate.printRaw(data, options);
	}

	async printHtml(html: string): Promise<void> {
		return this.delegate.printHtml(html);
	}

	async disconnect(): Promise<void> {
		return this.delegate.disconnect?.();
	}
}

type OriginProtocol = 'http:' | 'https:';

function getOriginProtocol(): OriginProtocol {
	return typeof window !== 'undefined' && window.location.protocol === 'https:'
		? 'https:'
		: 'http:';
}

export function resolveStarWebPrntUrl(
	host: string,
	port: number = 9100,
	originProtocol: OriginProtocol = getOriginProtocol()
): string {
	const secureOrigin = originProtocol === 'https:';
	// 9100 is the raw-TCP "use default" sentinel — pick the WebPRNT port matching the origin.
	const resolvedPort = port === 9100 ? (secureOrigin ? 443 : 80) : port;
	// The resolved port is the source of truth for the protocol, so an explicit port 80
	// stays plain HTTP even on an HTTPS origin (mixed content is handled via
	// targetAddressSpace — see withTargetAddressSpace). Must stay in sync with
	// deriveEndpointHint in packages/core .../printer/web-network-defaults.ts.
	const protocol = resolvedPort === 443 ? 'https' : 'http';
	return `${protocol}://${host}:${resolvedPort}/StarWebPRNT/SendMessage`;
}
