/// <reference path="./types/receipt-printer-encoder.d.ts" />
// Doctrine: packages/printer/README.md — acknowledged lanes first, raw only as an honest fallback;
// every live finding at a printer goes into that file's Lessons log in the same PR as the fix.
import PQueue from 'p-queue';

import { canOpenDrawer } from './capabilities';
import { buildDiagnosticTemplate } from './encoder/diagnostic-template';
import { buildReceiptMarkupJob, encodeReceipt } from './encoder/encode-receipt';
import {
	buildThermalTemplateMarkupJob,
	encodeThermalTemplateForPrint,
} from './encoder/thermal-print';
import { isVerboseDiagnostics, printerLogger } from './logger';
import { encodeThermalTemplate } from './renderer';
import { CloudAdapter } from './transport/cloud-adapter';
import { PRINT_JOB_SLOW_MS } from './transport/print-timeouts';
import { SystemPrintAdapter } from './transport/system-print-adapter';

import type { EncodeReceiptOptions } from './encoder/encode-receipt';
import type { ReceiptData } from './encoder/types';
import type { CloudEnqueueFn } from './transport/cloud-adapter';
import type { MarkupPrintJob, PrinterProfile, PrinterTransport, PrintRawOptions } from './types';

// Receipts are a few KB; diagnostics exports and live printer tests need exact bytes.
const RAW_JOB_HEX_PREVIEW_BYTES = 8192;
// A markup job serialises to the receipt text plus its template — the same order of magnitude as
// the raw hex preview, which is what a merchant's copied report has to carry.
const MARKUP_JOB_PREVIEW_CHARS = 8192;

/**
 * Queue key for jobs that belong to no profile — the system print dialog. The OS dialog is one
 * shared resource, so those jobs stay serial with each other and never block a printer's queue.
 */
const SYSTEM_QUEUE_ID = 'system';

/** What a queued job was for — the label on its timing line. */
type PrintJobKind =
	'receipt' | 'raw' | 'drawer' | 'cloud-order' | 'thermal-template' | 'html' | 'diagnostic';

/** Cache key that captures config-relevant fields so stale transports are evicted. */
function transportKey(profile: PrinterProfile, cloudFactoryVersion: number): string {
	const factoryVersion = profile.connectionType === 'cloud' ? cloudFactoryVersion : 0;
	return `${profile.id}:${profile.connectionType}:${profile.address ?? ''}:${profile.port}:${profile.vendor}:${profile.nativeInterfaceType ?? ''}:${profile.cloudPrinterId ?? ''}:${factoryVersion}`;
}

// ESC p pulse widths, in 2 ms units: 25 → 50 ms on, 250 → 500 ms off. Epson's own examples use
// these, and they are the widest values the clones accept — a shorter pulse fails to throw the
// solenoid on a stiff drawer.
const ESCPOS_DRAWER_PULSE_ON = 25;
const ESCPOS_DRAWER_PULSE_OFF = 250;

/**
 * The real-time kick (`DLE DC4 1 m t`) is an Epson command: it fires even while the printer is
 * busy, which is why Epson lanes keep it. Many clones implement only the queued `ESC p m t1 t2`
 * and ignore the real-time one entirely, so the drawer never opens — that is the whole of
 * gotcha N37. Anything not identified as an Epson gets `ESC p`.
 */
function encodeEscposDrawerKick(profile: PrinterProfile): Uint8Array | null {
	if (profile.language !== 'esc-pos') return null;
	const connector = profile.drawerConnector === 'pin5' ? 1 : 0;
	if (profile.vendor === 'epson') return Uint8Array.from([0x10, 0x14, 0x01, connector, 0x03]);
	return Uint8Array.from([0x1b, 0x70, connector, ESCPOS_DRAWER_PULSE_ON, ESCPOS_DRAWER_PULSE_OFF]);
}

/**
 * Verbose-diagnostics only, mirroring the raw hex preview: the template and its data, never the
 * render options — those carry rasterised image buffers, megabytes of unreadable pixels.
 */
// The preview is the template source only: `job.data` carries customer, tax and payment fields,
// and printer log lines end up in copied setup reports.
function markupPreview(job: MarkupPrintJob): { templatePreview: string; truncated: boolean } {
	const template = typeof job.template === 'string' ? job.template : JSON.stringify(job.template);
	return {
		templatePreview: template.slice(0, MARKUP_JOB_PREVIEW_CHARS),
		truncated: template.length > MARKUP_JOB_PREVIEW_CHARS,
	};
}

export interface PrinterServiceOptions {
	/**
	 * Builds the enqueue function for a `connectionType: 'cloud'` profile.
	 * Supplied by the host app, which owns the authenticated transport to the
	 * WCPOS plugin queue. Omitted until that wiring exists, in which case
	 * printing to a cloud profile throws.
	 */
	cloudEnqueueFactory?: (profile: PrinterProfile) => CloudEnqueueFn;
}

export interface TestPrintOptions {
	/** Override whether the diagnostic print should include a cash drawer pulse. */
	openDrawer?: boolean;
}

export class PrinterService {
	// One serial queue per profile id: a printer that hangs holds up its own receipts and nothing
	// else. A single shared queue meant a stalled printer stalled the till (gotcha N44).
	private queues = new Map<string, PQueue>();
	// Jobs accepted but not started, per profile; dispose() and cancelQueued() settle them instead
	// of leaving them pending forever.
	private pending = new Map<string, Set<(error: Error) => void>>();
	private closing = false;
	private transports = new Map<string, PrinterTransport>();
	private cloudFactoryVersion = 0;
	/** Tracks the config fingerprint used to create each cached transport. */
	private transportKeys = new Map<string, string>();

	constructor(private options: PrinterServiceOptions = {}) {}

	/**
	 * Set or replace the cloud enqueue factory after construction. Used by the
	 * host app to inject its authenticated transport into the singleton service.
	 */
	setCloudEnqueueFactory(factory: PrinterServiceOptions['cloudEnqueueFactory']): void {
		if (this.options.cloudEnqueueFactory === factory) {
			return;
		}
		this.cloudFactoryVersion += 1;
		this.options = { ...this.options, cloudEnqueueFactory: factory };
	}

	/**
	 * Get or create a transport for the given profile.
	 * Recreates the transport if the profile config has changed since last use.
	 * NetworkAdapter is loaded lazily to avoid triggering NativeEventEmitter at import time.
	 */
	private async getTransport(profile: PrinterProfile): Promise<PrinterTransport> {
		const key = transportKey(profile, this.cloudFactoryVersion);
		const cachedKey = this.transportKeys.get(profile.id);

		if (cachedKey === key) {
			const cached = this.transports.get(profile.id);
			if (cached) return cached;
		}

		// Evict stale transport
		const stale = this.transports.get(profile.id);
		if (stale) {
			await stale.disconnect?.();
			this.transports.delete(profile.id);
			this.transportKeys.delete(profile.id);
		}

		let transport: PrinterTransport;

		// Installed Windows queues use the device adapter, not the generic OS print dialog.
		switch (profile.address?.startsWith('winspool:') ? 'usb' : profile.connectionType) {
			case 'network': {
				if (!profile.address) {
					throw new Error('Network printer profile is missing an address');
				}
				const { NetworkAdapter } = await import('./transport/network-adapter');
				transport = new NetworkAdapter(profile.address, profile.port, profile.vendor);
				break;
			}
			case 'bluetooth':
			case 'usb': {
				const { createDeviceTransport } = await import('./transport/device-adapter');
				transport = await createDeviceTransport(profile);
				break;
			}
			case 'cloud': {
				if (!profile.cloudPrinterId) {
					throw new Error(`Cloud printer profile is missing a cloudPrinterId for ${profile.name}`);
				}
				if (!this.options.cloudEnqueueFactory) {
					throw new Error(
						'Cloud printing is not configured (no cloudEnqueueFactory provided to PrinterService)'
					);
				}
				const enqueue = this.options.cloudEnqueueFactory(profile);
				if (typeof enqueue !== 'function') {
					throw new Error(
						`Cloud printing is not configured (cloudEnqueueFactory must return an enqueue function for ${profile.cloudPrinterId})`
					);
				}
				transport = new CloudAdapter(profile.cloudPrinterId, enqueue);
				break;
			}
			case 'system':
				transport = new SystemPrintAdapter();
				break;
			default:
				throw new Error(`Unsupported connection type: ${profile.connectionType}`);
		}

		this.transports.set(profile.id, transport);
		this.transportKeys.set(profile.id, key);
		return transport;
	}

	/**
	 * Print a receipt with the built-in default layout via encodeReceipt().
	 * Custom XML templates go through printThermalTemplateForPrint(), which
	 * prepares image assets before encoding.
	 */
	async printReceipt(
		receiptData: ReceiptData,
		profile?: PrinterProfile,
		html?: string,
		decimals?: number
	): Promise<void> {
		return this.enqueue('receipt', profile?.id ?? SYSTEM_QUEUE_ID, async () => {
			if (
				!profile ||
				(profile.connectionType === 'system' && !profile.address?.startsWith('winspool:'))
			) {
				// Fallback: system print dialog with HTML
				const transport = new SystemPrintAdapter();
				if (!html) {
					throw new Error('System printing requires HTML content');
				}
				await transport.printHtml(html);
				return;
			}

			const transport = await this.getTransport(profile);
			const encodeOpts: EncodeReceiptOptions = {
				language: profile.language,
				columns: profile.columns,
				printerModel: profile.printerModel,
				emitEscPrintMode: profile.emitEscPrintMode ?? true,
				drawerConnector: profile.drawerConnector,
				cut: profile.autoCut,
				openDrawer: profile.autoOpenDrawer,
				codePage: profile.codePage,
				decimals,
			};
			if (await transport.supportsMarkup?.()) {
				await this.dispatchMarkup(
					transport,
					buildReceiptMarkupJob(receiptData, encodeOpts),
					'receipt'
				);
			} else {
				await this.dispatchRaw(transport, encodeReceipt(receiptData, encodeOpts));
			}
		});
	}

	private async dispatchRaw(
		transport: PrinterTransport,
		data: Uint8Array,
		options?: PrintRawOptions
	): Promise<void> {
		printerLogger.debug('Raw job dispatched', {
			context: {
				transport: transport.name,
				bytes: data.byteLength,
				...(isVerboseDiagnostics()
					? {
							hexPreview: Array.from(data.subarray(0, RAW_JOB_HEX_PREVIEW_BYTES), (byte) =>
								byte.toString(16).padStart(2, '0')
							).join(''),
							truncated: data.byteLength > RAW_JOB_HEX_PREVIEW_BYTES,
						}
					: {}),
			},
		});
		if (options) await transport.printRaw(data, options);
		else await transport.printRaw(data);
	}

	/** Markup jobs dispatch through here so the acknowledged lane logs like the raw one. */
	private async dispatchMarkup(
		transport: PrinterTransport,
		job: MarkupPrintJob,
		kind: PrintJobKind
	): Promise<void> {
		printerLogger.debug('Markup job dispatched', {
			context: {
				transport: transport.name,
				kind,
				dataKeys: Object.keys(job.data),
				...(isVerboseDiagnostics() ? markupPreview(job) : {}),
			},
		});
		await transport.printMarkup!(job);
	}

	/** The profile's queue, created on first use. */
	private queueFor(profileId: string): PQueue {
		const existing = this.queues.get(profileId);
		if (existing) return existing;
		const queue = new PQueue({ concurrency: 1 });
		this.queues.set(profileId, queue);
		return queue;
	}

	/** The profile's set of accepted-but-unstarted rejection handles, created on first use. */
	private pendingFor(profileId: string): Set<(error: Error) => void> {
		const existing = this.pending.get(profileId);
		if (existing) return existing;
		const created = new Set<(error: Error) => void>();
		this.pending.set(profileId, created);
		return created;
	}

	/**
	 * Every queued job runs through here so one line separates the time a job spent waiting
	 * behind other jobs from the time the transport itself took, and so a job that outlives
	 * PRINT_JOB_SLOW_MS says so while the cashier is still watching the spinner.
	 */
	private enqueue(kind: PrintJobKind, profileId: string, run: () => Promise<void>): Promise<void> {
		if (this.closing) return Promise.reject(new Error('Printer service is closing'));
		const enqueuedAt = Date.now();
		// p-queue's clear() drops queued tasks without settling their promises: race each job
		// against a rejection handle that dispose() and cancelQueued() can fire for jobs they removed.
		let rejectPending!: (error: Error) => void;
		const removed = new Promise<never>((_, reject) => {
			rejectPending = reject;
		});
		const pending = this.pendingFor(profileId);
		pending.add(rejectPending);
		let settled = false;
		const slowTimer = setTimeout(() => {
			if (settled) return;
			printerLogger.debug('Print job still running', {
				context: { kind, profileId, elapsedMs: Date.now() - enqueuedAt },
			});
		}, PRINT_JOB_SLOW_MS);
		const job = this.queueFor(profileId).add(async () => {
			pending.delete(rejectPending);
			const startedAt = Date.now();
			let outcome: 'ok' | 'failed' = 'ok';
			try {
				await run();
			} catch (error) {
				outcome = 'failed';
				throw error;
			} finally {
				printerLogger.debug('Print job timing', {
					context: {
						kind,
						profileId,
						outcome,
						waitMs: startedAt - enqueuedAt,
						transportMs: Date.now() - startedAt,
					},
				});
			}
		});
		return Promise.race([job, removed]).finally(() => {
			settled = true;
			clearTimeout(slowTimer);
			pending.delete(rejectPending);
		});
	}

	/**
	 * Drop this profile's jobs that have not started yet — the cashier's way out of a queue
	 * stacked up behind a printer that is not answering. The job already at the transport keeps
	 * running: its bytes are part-written, and no lane can be aborted safely mid-receipt.
	 */
	cancelQueued(profileId: string): void {
		this.queues.get(profileId)?.clear();
		const pending = this.pending.get(profileId);
		if (!pending) return;
		for (const reject of pending) reject(new Error('Print job cancelled'));
		pending.clear();
	}

	/**
	 * Print pre-encoded raw bytes.
	 */
	async printRaw(data: Uint8Array, profile: PrinterProfile): Promise<void> {
		return this.enqueue('raw', profile.id, async () => {
			const transport = await this.getTransport(profile);
			await this.dispatchRaw(transport, data);
		});
	}

	/** Fire just the cash-drawer kick — no receipt. Used by the "Open drawer" button. */
	async openDrawer(profile: PrinterProfile): Promise<void> {
		// Deliberately not isOrderBasedCloudProfile(): Star CloudPRNT renders its
		// receipts server-side but still accepts a raw drawer-kick payload, and a
		// standalone kick has no order or template to render from.
		if (!canOpenDrawer(profile)) {
			throw new Error('Open drawer is not supported for this printer profile.');
		}

		return this.enqueue('drawer', profile.id, async () => {
			const transport = await this.getTransport(profile);
			if (await transport.supportsMarkup?.()) {
				await this.dispatchMarkup(
					transport,
					{
						template: '<receipt><drawer/></receipt>',
						data: {},
						options: { drawerConnector: profile.drawerConnector },
					},
					'drawer'
				);
				return;
			}
			const bytes =
				encodeEscposDrawerKick(profile) ??
				encodeThermalTemplate(
					'<receipt><drawer /></receipt>',
					{},
					{
						language: profile.language,
						columns: profile.columns,
						printerModel: profile.printerModel,
						emitEscPrintMode: profile.emitEscPrintMode ?? true,
						drawerConnector: profile.drawerConnector,
					}
				);
			await this.dispatchRaw(transport, bytes, { cutPaper: false });
		});
	}

	/**
	 * Enqueue an order-based cloud print job. The client renders nothing; the
	 * server renders + delivers from the order + template. Used for cloud
	 * providers (Epson SDP, PrintNode) that reject raw client payloads or never
	 * poll. See wcpos/woocommerce-pos#1094.
	 */
	async printOrderViaCloud(
		profile: PrinterProfile,
		orderId: number,
		templateId: string
	): Promise<void> {
		return this.enqueue('cloud-order', profile.id, async () => {
			const transport = await this.getTransport(profile);
			if (!(transport instanceof CloudAdapter)) {
				throw new Error('Order-based printing requires a cloud printer profile');
			}
			await transport.enqueueOrder(orderId, templateId, {
				autoOpenDrawer: profile.autoOpenDrawer,
				drawerConnector: profile.drawerConnector,
			});
		});
	}

	/**
	 * Print a thermal XML template with Template Studio parity asset preparation.
	 *
	 * Encoding is intentionally inside the print queue so concurrent print calls
	 * cannot reorder when an earlier job spends longer rasterizing images/barcodes.
	 */
	async printThermalTemplateForPrint(
		receiptData: ReceiptData | Record<string, unknown>,
		profile: PrinterProfile,
		templateXml: string,
		maxWidthDots: number
	): Promise<void> {
		return this.enqueue('thermal-template', profile.id, async () => {
			const transport = await this.getTransport(profile);
			const input = {
				templateXml,
				receiptData,
				maxWidthDots,
				codePage: profile.codePage,
				encodeOptions: {
					language: profile.language,
					columns: profile.columns,
					printerModel: profile.printerModel,
					emitEscPrintMode: profile.emitEscPrintMode ?? true,
					openDrawer: profile.autoOpenDrawer,
					drawerConnector: profile.drawerConnector,
				},
			};
			if (await transport.supportsMarkup?.()) {
				await this.dispatchMarkup(
					transport,
					await buildThermalTemplateMarkupJob(input),
					'thermal-template'
				);
				return;
			}
			const bytes = await encodeThermalTemplateForPrint(input);
			await this.dispatchRaw(transport, bytes);
		});
	}

	/**
	 * Print HTML via system dialog.
	 */
	async printHtml(html: string): Promise<void> {
		return this.enqueue('html', SYSTEM_QUEUE_ID, async () => {
			const transport = new SystemPrintAdapter();
			await transport.printHtml(html);
		});
	}

	/**
	 * Send a test print to verify connectivity.
	 * System profiles without a Windows queue key get an HTML page via the system print dialog.
	 */
	async testPrint(profile: PrinterProfile, options: TestPrintOptions = {}): Promise<void> {
		if (profile.connectionType === 'system' && !profile.address?.startsWith('winspool:')) {
			const html = `<html><body style="font-family:monospace;text-align:center;padding:2em">
        <h2>WCPOS</h2><p>Test Print</p>
        <p>Printer: ${profile.name}</p>
        <p>Connection: System Dialog</p>
        <p>Date: ${new Date().toLocaleString()}</p>
        <br/><p>If you can read this, printing works!</p>
      </body></html>`;
			return this.printHtml(html);
		}

		return this.enqueue('diagnostic', profile.id, async () => {
			const transport = await this.getTransport(profile);
			const job = {
				template: buildDiagnosticTemplate(profile.columns),
				data: { printerName: profile.name, date: new Date().toLocaleString() },
				options: {
					language: profile.language,
					columns: profile.columns,
					printerModel: profile.printerModel,
					emitEscPrintMode: profile.emitEscPrintMode ?? true,
					openDrawer: options.openDrawer ?? profile.autoOpenDrawer,
					drawerConnector: profile.drawerConnector,
				},
			};
			if (await transport.supportsMarkup?.())
				await this.dispatchMarkup(transport, job, 'diagnostic');
			else {
				await this.dispatchRaw(
					transport,
					encodeThermalTemplate(job.template, job.data, job.options)
				);
			}
		});
	}

	/**
	 * Clean up all transports. Waits for in-flight jobs to finish first.
	 */
	async dispose(): Promise<void> {
		// Refuse new jobs, settle the ones that never started, let the running ones finish —
		// across every profile's queue.
		this.closing = true;
		for (const queue of this.queues.values()) queue.clear();
		for (const pending of this.pending.values()) {
			for (const reject of pending) reject(new Error('Printer service is closing'));
			pending.clear();
		}
		await Promise.all([...this.queues.values()].map((queue) => queue.onIdle()));
		this.queues.clear();
		this.pending.clear();

		for (const transport of this.transports.values()) {
			await transport.disconnect?.();
		}
		this.transports.clear();
		this.transportKeys.clear();
	}
}
