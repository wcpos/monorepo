import { probeEposEndpoint } from './epos-endpoint';
import { EpsonEposAdapter, postEposHttp } from './epson-epos-adapter.electron';
import { ipcPrintRaw, PRINT_TIMEOUT_MS } from './ipc-print.electron';

import type { PrinterTransport } from '../types';

const eposPortByHost = new Map<string, number | null>();

/**
 * Electron network adapter.
 * Sends raw ESC/POS bytes to a printer via TCP through the main process.
 */
export class NetworkAdapter implements PrinterTransport {
	readonly name = 'network-electron';

	constructor(
		private host: string,
		private port: number = 9100,
		private vendor?: string
	) {}

	async printRaw(data: Uint8Array): Promise<void> {
		if (this.vendor === 'epson') {
			let eposPort = eposPortByHost.get(this.host);
			if (!eposPortByHost.has(this.host)) {
				eposPort = await probeEposEndpoint(this.host, (port, path, xml, timeoutMs) =>
					postEposHttp(this.host, port, path, xml, timeoutMs)
				);
				eposPortByHost.set(this.host, eposPort);
			}
			if (eposPort != null) {
				return new EpsonEposAdapter(this.host, eposPort).printRaw(data);
			}
		}

		await ipcPrintRaw(
			'print-raw-tcp',
			{
				host: this.host,
				port: this.port,
				data,
			},
			`Print timed out after ${PRINT_TIMEOUT_MS}ms`
		);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('NetworkAdapter does not support HTML printing. Use printRaw instead.');
	}

	async disconnect(): Promise<void> {
		// TCP connections are per-request; nothing to clean up
	}
}
