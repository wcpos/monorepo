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
	// A miss is held for the job that probed it, so supportsMarkup() and the print that follows
	// share one probe sequence (four 4 s probes, not eight). It never outlives the job.
	private holdsEposMiss = false;

	constructor(
		private host: string,
		private port: number = 9100,
		private vendor?: string
	) {}

	/**
	 * Job boundary (PrinterService calls it as each job takes this transport): drop a miss a
	 * previous job probed but never printed through, so every job probes afresh.
	 */
	beginJob(): void {
		this.forgetEposMiss();
	}

	async printRaw(data: Uint8Array): Promise<void> {
		const eposPort = await this.resolveEposPort();
		if (eposPort != null) {
			return new EpsonEposAdapter(this.host, eposPort).printRaw(data);
		}
		this.forgetEposMiss();

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
		if (eposPort == null) {
			this.forgetEposMiss();
			throw new Error('markup printing is not available on this transport');
		}
		return new EpsonEposAdapter(this.host, eposPort).printMarkup(job);
	}

	private resolveEposPort(): Promise<number | null> {
		if (this.vendor !== 'epson') return Promise.resolve(null);
		if (EPOS_HTTP_PORTS.includes(this.port)) return Promise.resolve(this.port);
		if (this.holdsEposMiss) {
			printerLogger.info('Reusing this job’s ePOS probe miss', { context: { host: this.host } });
		}
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
		// Never remember a miss across jobs (roadmap#136 gotcha #5): it is held only until this job
		// prints or the next job begins, and then the next job probes again.
		else this.holdsEposMiss = true;
		return port;
	}

	private forgetEposMiss(): void {
		if (!this.holdsEposMiss) return;
		this.holdsEposMiss = false;
		this.resolvedEposPort = undefined;
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('NetworkAdapter does not support HTML printing. Use printRaw instead.');
	}

	async disconnect(): Promise<void> {
		// TCP connections are per-request; nothing to clean up
	}
}
