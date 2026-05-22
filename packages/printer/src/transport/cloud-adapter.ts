import type { PrinterTransport } from '../types';

/** A print job destined for the cloud queue. */
export interface CloudPrintJob {
	/** Pre-encoded payload bytes (ESC/POS, StarPRNT, raster image, or UTF-8 HTML). */
	data: Uint8Array;
	/** MIME type describing the payload, e.g. 'application/octet-stream' or 'text/html'. */
	contentType: string;
}

/**
 * Enqueues a print job for a cloud printer. Supplied by the host app, which
 * owns the authenticated transport to the WCPOS plugin queue.
 *
 * Kept as an injected function so this adapter has no knowledge of the queue's
 * URL, auth, or wire protocol (Star CloudPRNT vs Epson SDP). See cloud-print
 * spec §5.1.
 */
export type CloudEnqueueFn = (printerId: string, job: CloudPrintJob) => Promise<void>;

/**
 * Cloud transport adapter. Instead of pushing bytes to a local printer, it
 * enqueues the job with the plugin so a cloud printer can pull it. Direct
 * adapters (network/native) push; this one hands off to the queue.
 */
export class CloudAdapter implements PrinterTransport {
	readonly name = 'cloud';

	constructor(
		private readonly cloudPrinterId: string,
		private readonly enqueue: CloudEnqueueFn
	) {}

	async printRaw(data: Uint8Array): Promise<void> {
		await this.enqueue(this.cloudPrinterId, { data, contentType: 'application/octet-stream' });
	}

	async printHtml(html: string): Promise<void> {
		await this.enqueue(this.cloudPrinterId, {
			data: new TextEncoder().encode(html),
			contentType: 'text/html',
		});
	}
}
