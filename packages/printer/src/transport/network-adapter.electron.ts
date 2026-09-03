import { EPOS_HTTP_PORTS, probeEposEndpoint } from './epos-endpoint';
import { EpsonEposAdapter, postEposHttp } from './epson-epos-adapter.electron';
import { ipcPrintRaw, PRINT_TIMEOUT_MS } from './ipc-print.electron';

import type { PrinterTransport } from '../types';

// Cache successes only: a cached miss can repeat the roadmap#136 gotcha #5 quarantine loop.
const eposPortByHost = new Map<string, number>();

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
			if (EPOS_HTTP_PORTS.includes(this.port)) {
				return new EpsonEposAdapter(this.host, this.port).printRaw(data);
			}

			let eposPort: number | null | undefined = eposPortByHost.get(this.host);
			if (eposPort == null) {
				eposPort = await probeEposEndpoint(this.host, (port, path, xml, timeoutMs) =>
					postEposHttp(this.host, port, path, xml, timeoutMs)
				);
				if (eposPort != null) eposPortByHost.set(this.host, eposPort);
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
