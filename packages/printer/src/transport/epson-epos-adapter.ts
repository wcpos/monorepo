import type { PrinterTransport } from '../types';

const EPOS_PRINT_NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';
const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';

/**
 * Epson ePOS HTTP adapter for web browsers.
 *
 * Communicates with Epson TM-series printers using the built-in HTTP
 * endpoint at `/cgi-bin/epos/service.cgi`. This is a simple SOAP/XML
 * interface — no external SDK required.
 *
 * The printer must have ePOS enabled in its network settings (this is
 * the default on most TM-T88/TM-m series printers).
 *
 * **Ports:**
 * - HTTP:  80 (default) or 8008
 * - HTTPS: 443 (default) or 8043
 *
 * **CORS / mixed-content notes:**
 * Epson printers with ePOS support respond with `Access-Control-Allow-Origin: *`.
 * However, if the POS app is served over HTTPS and the printer only has a
 * self-signed certificate, the browser will reject the connection. Navigate
 * to `https://<printer-ip>` first and accept the certificate, or access the
 * POS app over HTTP.
 */
export class EpsonEposAdapter implements PrinterTransport {
	readonly name = 'epson-epos-http';

	private deviceId: string;
	private baseUrl: string;

	/**
	 * @param host   - Printer IP address or hostname
	 * @param port   - HTTP(S) port. 8043/443 → HTTPS, anything else → HTTP.
	 * @param deviceId - ePOS device ID, typically "local_printer"
	 */
	constructor(host: string, port: number = 8008, deviceId: string = 'local_printer') {
		this.deviceId = deviceId;

		const protocol = port === 8043 || port === 443 ? 'https' : 'http';
		this.baseUrl = `${protocol}://${host}:${port}`;
	}

	async printRaw(data: Uint8Array): Promise<void> {
		const hex = uint8ArrayToHex(data);
		await this.sendEposPrint(`<command>${hex}</command>`);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('EpsonEposAdapter does not support HTML printing.');
	}

	async disconnect(): Promise<void> {
		// HTTP is stateless — nothing to clean up
	}

	private async sendEposPrint(innerXml: string): Promise<void> {
		const url =
			`${this.baseUrl}/cgi-bin/epos/service.cgi` +
			`?devid=${encodeURIComponent(this.deviceId)}&timeout=10000`;

		const body = [
			'<?xml version="1.0" encoding="utf-8"?>',
			`<s:Envelope xmlns:s="${SOAP_NS}">`,
			'<s:Body>',
			`<epos-print xmlns="${EPOS_PRINT_NS}">`,
			innerXml,
			'</epos-print>',
			'</s:Body>',
			'</s:Envelope>',
		].join('');

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15_000);

		let response: Response;
		try {
			response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/xml; charset=utf-8',
					'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
					SOAPAction: '""',
				},
				body,
				signal: controller.signal,
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new Error(
					`Epson ePOS request timed out. Check that the printer is reachable at ${this.baseUrl}`
				);
			}
			throw new Error(
				`Could not connect to Epson printer at ${this.baseUrl}. ` +
					"Check the IP address and ensure ePOS is enabled in the printer's network settings. " +
					"If using HTTPS, you may need to accept the printer's self-signed certificate " +
					`by visiting ${this.baseUrl} in your browser first.`
			);
		} finally {
			clearTimeout(timeoutId);
		}

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			throw new Error(`Epson ePOS HTTP ${response.status}: ${text || response.statusText}`);
		}

		const responseText = await response.text();
		const successMatch = responseText.match(/success\s*=\s*"([^"]*)"/);
		const codeMatch = responseText.match(/code\s*=\s*"([^"]*)"/);

		if (successMatch && successMatch[1] !== 'true' && successMatch[1] !== '1') {
			const code = codeMatch?.[1] || 'unknown';
			throw new Error(`Epson print failed (code: ${code})`);
		}
	}
}

function uint8ArrayToHex(bytes: Uint8Array): string {
	const parts: string[] = [];
	for (let i = 0; i < bytes.length; i++) {
		parts.push(bytes[i].toString(16).padStart(2, '0'));
	}
	return parts.join('');
}
