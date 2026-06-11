import { buildConnectionErrorMessage } from '../utils/connection-error';
import { withTargetAddressSpace } from '../utils/local-fetch';

import type { PrinterTransport } from '../types';

/**
 * Star WebPRNT adapter for web browsers.
 *
 * Star printers with a WebPRNT interface expose an HTTP endpoint that
 * accepts XML-wrapped print commands. This adapter converts raw ESC/POS
 * (or StarPRNT) byte arrays into the Star WebPRNT XML format and POSTs
 * them directly using fetch() -- no vendor SDK required.
 *
 * Typical endpoint URL:
 *   https://192.168.1.100/StarWebPRNT/SendMessage
 *
 * If your Star printer uses HTTP instead of HTTPS, Chromium browsers (142+)
 * allow the request from a secure page via Local Network Access — the user
 * must accept a one-time local-network permission prompt. Other browsers
 * block plain-HTTP requests from HTTPS pages as mixed content.
 */
export class StarWebPrntAdapter implements PrinterTransport {
	readonly name = 'star-webprnt';

	constructor(private url: string) {}

	async printRaw(data: Uint8Array): Promise<void> {
		const base64 = uint8ArrayToBase64(data);

		const xml = [
			'<?xml version="1.0" encoding="utf-8"?>',
			'<StarWebPrint xmlns="http://schema.starwebprnt.com" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">',
			'  <SendMessage>',
			'    <Request>',
			'      <initialize />',
			`      <rawData>${base64}</rawData>`,
			'      <cutpaper feed="true" />',
			'    </Request>',
			'  </SendMessage>',
			'</StarWebPrint>',
		].join('\n');

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30_000);

		let response: Response;
		try {
			response = await fetch(
				this.url,
				withTargetAddressSpace(this.url, {
					method: 'POST',
					headers: {
						'Content-Type': 'text/xml; charset=utf-8',
					},
					body: xml,
					signal: controller.signal,
				})
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new Error(
					`Star WebPRNT request timed out. Check that the printer is reachable at ${this.url}`
				);
			}
			throw new Error(
				buildConnectionErrorMessage({
					vendorLabel: 'Star',
					url: this.url,
					enableHint: 'ensure WebPRNT is enabled on the printer',
					plainHttpPort: 80,
				})
			);
		} finally {
			clearTimeout(timeoutId);
		}

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(
				`Star WebPRNT request failed (HTTP ${response.status}): ${body || response.statusText}`
			);
		}

		// Parse the response XML to check for printer errors
		const responseText = await response.text();
		const statusMatch = responseText.match(/<Status>(\w+)<\/Status>/);
		if (statusMatch && statusMatch[1] !== 'Normal') {
			throw new Error(`Star printer reported status: ${statusMatch[1]}`);
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('StarWebPrntAdapter does not support HTML printing.');
	}

	async disconnect(): Promise<void> {
		// HTTP is stateless -- nothing to clean up
	}
}

/**
 * Convert a Uint8Array to a base64 string.
 *
 * Uses the browser's btoa() when available, which covers all
 * modern browsers and web workers.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
	const CHUNK_SIZE = 8192;
	const chunks: string[] = [];
	for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
		const chunk = bytes.subarray(i, i + CHUNK_SIZE);
		chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
	}
	return btoa(chunks.join(''));
}
