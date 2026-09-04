import { encodeThermalTemplateToEpos } from '@wcpos/receipt-renderer';

import { buildConnectionError } from '../utils/connection-error';
import { buildEposXml, commandFromBytes, parseEposResponse } from './epson-epos-protocol';
import { getIpc } from './ipc-print.electron';

import type { MarkupPrintJob, PrinterTransport } from '../types';

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
		// <command> pass-through is not printable when Secure Printing is on; the service prefers printMarkup.
		await this.sendEposPrint(commandFromBytes(data));
	}

	supportsMarkup = (): boolean => true;
	printMarkup = async (job: MarkupPrintJob): Promise<void> =>
		this.sendEposPrint(encodeThermalTemplateToEpos(job.template, job.data, job.options));
	private async sendEposPrint(innerXml: string): Promise<void> {
		const path =
			'/cgi-bin/epos/service.cgi' + `?devid=${encodeURIComponent(this.deviceId)}&timeout=10000`;
		const url = `${this.port === 443 || this.port === 8043 ? 'https' : 'http'}://${this.host}:${this.port}${path}`;

		let response: { status: number; body: string };
		try {
			response = await postEposHttp(
				this.host,
				this.port,
				path,
				buildEposXml(innerXml),
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
			// The printer answered — this is a rejection (CoverOpen, Offline, SchemaError…),
			// not a connection failure. A plain Error keeps the ePOS code in the message the
			// dialog shows, instead of burying it under connectivity/certificate guidance.
			throw new Error(`Epson print failed (code: ${result.code || 'unknown'})`);
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('EpsonEposAdapter does not support HTML printing.');
	}

	async disconnect(): Promise<void> {
		// HTTP is stateless — nothing to clean up
	}

	private connectionError(url: string, cause: unknown): Error {
		return buildConnectionError({
			vendorLabel: 'Epson',
			protocolName: 'ePOS',
			url,
			enableHint: "ensure ePOS is enabled in the printer's network settings",
			plainHttpPort: 8008,
			cause,
		});
	}
}
