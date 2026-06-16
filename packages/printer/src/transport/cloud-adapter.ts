import type { PrinterProfile, PrinterTransport } from '../types';

/**
 * Whether a profile must be printed as a server-rendered, order-based cloud job
 * rather than a client-rendered raw byte upload.
 *
 * True only for the `epson-sdp` and `printnode` providers: Epson SDP rejects raw
 * client payloads and PrintNode never polls, so the client must NOT render bytes
 * for them. Star CloudPRNT and any unknown / missing provider return false and
 * keep the raw-upload behaviour (Star is the shipped happy path).
 */
export function isOrderBasedCloudProfile(profile: PrinterProfile | undefined): boolean {
	return (
		profile?.connectionType === 'cloud' &&
		(profile.cloudProvider === 'epson-sdp' || profile.cloudProvider === 'printnode')
	);
}

/**
 * A print job destined for the cloud queue. Two variants:
 *
 * - `raw` — pre-encoded payload bytes the client rendered locally. The printer
 *   polls and receives them as-is. Used by Star CloudPRNT (and any unknown /
 *   legacy provider that falls back to Star behaviour).
 * - `order` — no payload; the server renders & delivers the receipt from the
 *   order + template. Required by Epson SDP (rejects raw payloads) and PrintNode
 *   (never polls), which the client must NOT render for. See cloud-print spec
 *   and wcpos/woocommerce-pos#1094.
 */
export type CloudPrintJob =
	| {
			kind: 'raw';
			/** Pre-encoded payload bytes (ESC/POS, StarPRNT, raster image, or UTF-8 HTML). */
			data: Uint8Array;
			/** MIME type describing the payload, e.g. 'application/octet-stream' or 'text/html'. */
			contentType: string;
	  }
	| {
			kind: 'order';
			/** WooCommerce order id the server should render. */
			orderId: number;
			/** Server template id (`wcpos_template` post id or virtual slug) to render with. */
			templateId: string;
			/** Whether the server-rendered order receipt should kick the cash drawer. */
			autoOpenDrawer?: boolean;
			/** Cash-drawer connector used for drawer kick pulses. */
			drawerConnector?: PrinterProfile['drawerConnector'];
	  };

export interface CloudOrderDrawerOptions {
	autoOpenDrawer?: boolean;
	drawerConnector?: PrinterProfile['drawerConnector'];
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
		await this.enqueue(this.cloudPrinterId, {
			kind: 'raw',
			data,
			contentType: 'application/octet-stream',
		});
	}

	async printHtml(html: string): Promise<void> {
		await this.enqueue(this.cloudPrinterId, {
			kind: 'raw',
			data: new TextEncoder().encode(html),
			contentType: 'text/html',
		});
	}

	/**
	 * Enqueue an order-based job. The server renders + delivers from the order +
	 * template — used for providers (Epson SDP, PrintNode) the client must not
	 * render bytes for.
	 */
	async enqueueOrder(
		orderId: number,
		templateId: string,
		options: CloudOrderDrawerOptions = {}
	): Promise<void> {
		const job: CloudPrintJob = { kind: 'order', orderId, templateId };
		if (options.autoOpenDrawer !== undefined) {
			job.autoOpenDrawer = options.autoOpenDrawer;
		}
		if (options.drawerConnector) {
			job.drawerConnector = options.drawerConnector;
		}
		await this.enqueue(this.cloudPrinterId, job);
	}
}
