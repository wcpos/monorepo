// Doctrine: packages/printer/README.md — lane order and the raw-fallback rule are decided there,
// not here; read the Lessons log before changing the probe/fallback sequence.
import { EPOS_HTTP_PORTS, probeEposEndpoint } from './epos-endpoint';
import { statusQueryUnavailable } from './escpos-status';
import { EpsonEposAdapter, postEposHttp } from './epson-epos-adapter.electron';
import { ipcPrintRaw, PRINT_TIMEOUT_MS } from './ipc-print.electron';
import { printerLogger } from '../logger';

import type { PrinterStatus } from './escpos-status';
import type { MarkupPrintJob, PrinterTransport } from '../types';

// Cache successes only: a cached miss can repeat the roadmap#136 gotcha #5 quarantine loop.
const eposPortByHost = new Map<string, number>();

/**
 * Electron network adapter.
 * Sends raw ESC/POS bytes to a printer via TCP through the main process.
 */
export class NetworkAdapter implements PrinterTransport {
	readonly name = 'network-electron';
	private resolvedEposPort?: Promise<number | null>;

	constructor(
		private host: string,
		private port: number = 9100,
		private vendor?: string
	) {}

	async printRaw(data: Uint8Array): Promise<void> {
		const eposPort = await this.resolveEposPort();
		if (eposPort != null) {
			return new EpsonEposAdapter(this.host, eposPort).printRaw(data);
		}
		this.resolvedEposPort = undefined;

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

	/**
	 * Raw 9100 is write-only from here: the socket lives in the main process, which sends bytes
	 * and reads nothing back. Reading the reply needs a `usb-query-status`-style channel of its
	 * own; until then this lane cannot ask (audit D4).
	 */
	async queryStatus(): Promise<PrinterStatus | null> {
		return statusQueryUnavailable(this.name);
	}

	async supportsMarkup(): Promise<boolean> {
		return (await this.resolveEposPort()) != null;
	}

	async printMarkup(job: MarkupPrintJob): Promise<void> {
		const eposPort = await this.resolveEposPort();
		if (eposPort == null) throw new Error('markup printing is not available on this transport');
		return new EpsonEposAdapter(this.host, eposPort).printMarkup(job);
	}

	private resolveEposPort(): Promise<number | null> {
		if (this.vendor !== 'epson') return Promise.resolve(null);
		if (EPOS_HTTP_PORTS.includes(this.port)) return Promise.resolve(this.port);
		this.resolvedEposPort ??= this.probeEposPort();
		return this.resolvedEposPort;
	}

	private async probeEposPort(): Promise<number | null> {
		const cached = eposPortByHost.get(this.host);
		if (cached != null) {
			printerLogger.info('Using cached ePOS port', { context: { host: this.host, port: cached } });
			return cached;
		}
		const port = await probeEposEndpoint(this.host, (candidate, path, xml, timeoutMs) =>
			postEposHttp(this.host, candidate, path, xml, timeoutMs)
		);
		if (port != null) {
			eposPortByHost.set(this.host, port);
			printerLogger.info('Using freshly probed ePOS port', { context: { host: this.host, port } });
		}
		// Never remember a miss (roadmap#136 gotcha #5): the next call probes again.
		else this.resolvedEposPort = undefined;
		return port;
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('NetworkAdapter does not support HTML printing. Use printRaw instead.');
	}

	async disconnect(): Promise<void> {
		// TCP connections are per-request; nothing to clean up
	}
}
