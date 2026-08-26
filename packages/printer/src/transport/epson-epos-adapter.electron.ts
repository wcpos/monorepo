import { buildConnectionError } from '../utils/connection-error';
import { buildEposXml, commandFromBytes, parseEposResponse } from './epson-epos-protocol';
import { getIpc } from './ipc-print.electron';

import type { PrinterTransport } from '../types';

const REQUEST_TIMEOUT_MS = 15_000;

export async function postEposHttp(
	host: string,
	port: number,
	path: string,
	xml: string,
	timeoutMs: number
): Promise<{ status: number; body: string }> {
	return getIpc().invoke('print-epos-http', { host, port, path, xml, timeoutMs });
}

export class EpsonEposAdapter implements PrinterTransport {
	readonly name = 'epson-epos-http';

	constructor(
		private host: string,
		private port: number = 8008,
		private deviceId: string = 'local_printer'
	) {}

	async printRaw(data: Uint8Array): Promise<void> {
		const path =
			'/cgi-bin/epos/service.cgi' + `?devid=${encodeURIComponent(this.deviceId)}&timeout=10000`;
		const url = `${this.port === 443 || this.port === 8043 ? 'https' : 'http'}://${this.host}:${this.port}${path}`;

		let response: { status: number; body: string };
		try {
			response = await postEposHttp(
				this.host,
				this.port,
				path,
				buildEposXml(commandFromBytes(data)),
				REQUEST_TIMEOUT_MS
			);
		} catch (cause) {
			throw this.connectionError(url, cause);
		}

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`Epson ePOS HTTP ${response.status}: ${response.body}`);
		}

		const result = parseEposResponse(response.body);
		if (!result.success) {
			const code = result.code || 'unknown';
			throw this.connectionError(url, new Error(`Epson ePOS code: ${code}`), code);
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('EpsonEposAdapter does not support HTML printing.');
	}

	async disconnect(): Promise<void> {
		// HTTP is stateless — nothing to clean up
	}

	private connectionError(url: string, cause: unknown, code?: string): Error {
		const error = buildConnectionError({
			vendorLabel: 'Epson',
			protocolName: 'ePOS',
			url,
			enableHint: "ensure ePOS is enabled in the printer's network settings",
			plainHttpPort: 8008,
			cause,
		});
		if (code) error.message += ` Epson ePOS code: ${code}.`;
		return error;
	}
}
