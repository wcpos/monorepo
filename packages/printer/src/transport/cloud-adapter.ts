import type { PrinterProfile, PrinterTransport } from '../types';

/**
 * Providers that cannot accept a client-uploaded raw payload at all.
 *
 * Epson SDP rejects raw client payloads outright; PrintNode never polls the
 * queue, so bytes left there are never collected.
 */
const RAW_REJECTING_CLOUD_PROVIDERS = ['epson-sdp', 'printnode'] as const;

/**
 * Whether a profile must be printed as a server-rendered, order-based cloud job
 * rather than a client-rendered raw byte upload.
 *
 * Star CloudPRNT joined the order-based providers once the plugin learned to
 * negotiate a media type and render at fetch time (wcpos/woocommerce-pos#1351).
 * Before that the client had to guess the wire format and upload bytes blind,
 * which is how it ended up shipping ESC/POS to printers that cannot decode it.
 * The server now asks the printer what it can decode and renders to match, so
 * the client's job is to name the order and the template, nothing more.
 *
 * An unknown or missing provider still returns false: a legacy profile from
 * before the field existed keeps the raw-upload behaviour it was written for.
 */
export function isOrderBasedCloudProfile(profile: PrinterProfile | undefined): boolean {
	if (profile?.connectionType !== 'cloud') {
		return false;
	}

	return (
		profile.cloudProvider === 'star-cloudprnt' ||
		(RAW_REJECTING_CLOUD_PROVIDERS as readonly string[]).includes(profile.cloudProvider ?? '')
	);
}

/**
 * Whether a profile can be sent a one-off raw payload outside the receipt flow.
 *
 * Distinct from `isOrderBasedCloudProfile`: that answers "who renders the
 * receipt", this answers "can we hand this printer arbitrary bytes at all". A
 * standalone cash-drawer kick has no order and no template behind it, so it can
 * only ever be raw — and Star CloudPRNT still accepts raw jobs even though its
 * receipts are now server-rendered. Conflating the two would break the "Open
 * drawer" button for every Star printer.
 */
export function acceptsRawCloudUpload(profile: PrinterProfile | undefined): boolean {
	if (profile?.connectionType !== 'cloud') {
		// Direct transports (network, USB, serial, Bluetooth) always take bytes.
		return true;
	}

	return !(RAW_REJECTING_CLOUD_PROVIDERS as readonly string[]).includes(
		profile.cloudProvider ?? ''
	);
}

/**
 * A print job destined for the cloud queue. Two variants:
 *
 * - `raw` — pre-encoded payload bytes the client rendered locally. The printer
 *   polls and receives them as-is. Now only a legacy profile with no provider,
 *   and one-off payloads with no order behind them such as a drawer kick.
 * - `order` — no payload; the server renders & delivers the receipt from the
 *   order + template. Required by Epson SDP (rejects raw payloads) and PrintNode
 *   (never polls), and used by Star CloudPRNT since the server gained media-type
 *   negotiation. See cloud-print spec, wcpos/woocommerce-pos#1094 and #1351.
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
