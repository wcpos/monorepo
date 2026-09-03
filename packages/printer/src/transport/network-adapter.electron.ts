import { EPOS_HTTP_PORTS, probeEposEndpoint } from './epos-endpoint';
import { EpsonEposAdapter, postEposHttp } from './epson-epos-adapter.electron';
import { ipcPrintRaw, PRINT_TIMEOUT_MS } from './ipc-print.electron';

import type { PrinterTransport } from '../types';

// Cache successes only: a cached miss can repeat the roadmap#136 gotcha #5 quarantine loop.
const eposPortByHost = new Map<string, number>();
// Hosts whose 9143 TLS handshake succeeded. Successes only, same reason as above.
const rawTlsHosts = new Set<string>();
// A non-RED Epson refuses 9143 instantly; 2 s bounds a filtered port on a legacy profile.
const RAW_TLS_PROBE_TIMEOUT_MS = 2_000;

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
			if (this.port === 9143) {
				return this.printRawTls(data);
			}
			if (EPOS_HTTP_PORTS.includes(this.port)) {
				return new EpsonEposAdapter(this.host, this.port).printRaw(data);
			}
			// Legacy profile (saved at 9100 before the TLS lane existed): a zero-byte handshake on
			// 9143 decides the lane. Only the probe is raced against the timer — racing the job
			// itself would let a slow handshake print after the fallback had already gone to ePOS
			// or raw 9100 (a double print, or a Secure Printing quarantine). A missing Electron
			// handler rejects the probe and lands in the legacy routing below.
			if (rawTlsHosts.has(this.host) || (await this.probeRawTls())) {
				rawTlsHosts.add(this.host);
				return this.printRawTls(data);
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

	private printRawTls(data: Uint8Array): Promise<void> {
		return ipcPrintRaw(
			'print-raw-tls',
			{ host: this.host, port: 9143, data },
			`Print timed out after ${PRINT_TIMEOUT_MS}ms`
		);
	}

	/** Zero bytes: the TLS handshake is the probe; nothing is written to the printer. */
	private async probeRawTls(): Promise<boolean> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				this.printRawTls(new Uint8Array(0)),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error('Raw TLS probe timed out')),
						RAW_TLS_PROBE_TIMEOUT_MS
					);
				}),
			]);
			return true;
		} catch {
			return false;
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('NetworkAdapter does not support HTML printing. Use printRaw instead.');
	}

	async disconnect(): Promise<void> {
		// TCP connections are per-request; nothing to clean up
	}
}
