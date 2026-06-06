import { EpsonEposAdapter } from './epson-epos-adapter';
import { StarWebPrntAdapter } from './star-webprnt-adapter';

import type { PrinterTransport } from '../types';

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

	async printRaw(data: Uint8Array): Promise<void> {
		return this.delegate.printRaw(data);
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
	return typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
}

export function resolveStarWebPrntUrl(
	host: string,
	port: number = 9100,
	originProtocol: OriginProtocol = getOriginProtocol()
): string {
	const secureOrigin = originProtocol === 'https:';
	const protocol = secureOrigin ? 'https' : 'http';
	const resolvedPort = port === 9100 ? (secureOrigin ? 443 : 80) : port;
	return `${protocol}://${host}:${resolvedPort}/StarWebPRNT/SendMessage`;
}
