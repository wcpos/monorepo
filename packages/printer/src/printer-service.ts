/// <reference path="./types/receipt-printer-encoder.d.ts" />
import PQueue from 'p-queue';

import { buildDiagnosticTemplate } from './encoder/diagnostic-template';
import { encodeReceipt } from './encoder/encode-receipt';
import { formatReceiptData } from './encoder/format-receipt-data';
import { encodeThermalTemplateForPrint } from './encoder/thermal-print';
import { encodeThermalTemplate } from './renderer';
import { CloudAdapter, isOrderBasedCloudProfile } from './transport/cloud-adapter';
import { SystemPrintAdapter } from './transport/system-print-adapter';

import type { EncodeReceiptOptions } from './encoder/encode-receipt';
import type { ReceiptData } from './encoder/types';
import type { CloudEnqueueFn } from './transport/cloud-adapter';
import type { PrinterProfile, PrinterTransport } from './types';

/** Cache key that captures config-relevant fields so stale transports are evicted. */
function transportKey(profile: PrinterProfile, cloudFactoryVersion: number): string {
	const factoryVersion = profile.connectionType === 'cloud' ? cloudFactoryVersion : 0;
	return `${profile.id}:${profile.connectionType}:${profile.address ?? ''}:${profile.port}:${profile.vendor}:${profile.nativeInterfaceType ?? ''}:${profile.cloudPrinterId ?? ''}:${factoryVersion}`;
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

export class PrinterService {
	private queue = new PQueue({ concurrency: 1 });
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

		switch (profile.connectionType) {
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
	 * Print a receipt using the given profile.
	 * If templateXml is provided, uses the custom XML template via encodeThermalTemplate().
	 * Otherwise falls back to the built-in default layout via encodeReceipt().
	 */
	async printReceipt(
		receiptData: ReceiptData,
		profile?: PrinterProfile,
		html?: string,
		templateXml?: string,
		decimals?: number
	): Promise<void> {
		return this.queue.add(async () => {
			if (!profile || profile.connectionType === 'system') {
				// Fallback: system print dialog with HTML
				const transport = new SystemPrintAdapter();
				if (!html) {
					throw new Error('System printing requires HTML content');
				}
				await transport.printHtml(html);
				return;
			}

			const transport = await this.getTransport(profile);
			const encoderOptions = {
				language: profile.language,
				columns: profile.columns,
				printerModel: profile.printerModel,
				emitEscPrintMode: profile.emitEscPrintMode ?? true,
				drawerConnector: profile.drawerConnector,
			};

			let bytes: Uint8Array;
			if (templateXml) {
				const templateData = formatReceiptData(receiptData);
				bytes = encodeThermalTemplate(templateXml, templateData, {
					...encoderOptions,
					openDrawer: profile.autoOpenDrawer,
				});
			} else {
				const encodeOpts: EncodeReceiptOptions = {
					...encoderOptions,
					cut: profile.autoCut,
					openDrawer: profile.autoOpenDrawer,
					decimals,
				};
				bytes = encodeReceipt(receiptData, encodeOpts);
			}

			await transport.printRaw(bytes);
		});
	}

	/**
	 * Print pre-encoded raw bytes.
	 */
	async printRaw(data: Uint8Array, profile: PrinterProfile): Promise<void> {
		return this.queue.add(async () => {
			const transport = await this.getTransport(profile);
			await transport.printRaw(data);
		});
	}

	/** Fire just the cash-drawer kick — no receipt. Used by the "Open drawer" button. */
	async openDrawer(profile: PrinterProfile): Promise<void> {
		if (isOrderBasedCloudProfile(profile)) {
			throw new Error(
				'Open drawer is not supported for order-based cloud printers (Epson SDP, PrintNode).'
			);
		}

		return this.queue.add(async () => {
			const transport = await this.getTransport(profile);
			const bytes = encodeThermalTemplate(
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
			await transport.printRaw(bytes, { cutPaper: false });
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
		return this.queue.add(async () => {
			const transport = await this.getTransport(profile);
			if (!(transport instanceof CloudAdapter)) {
				throw new Error('Order-based printing requires a cloud printer profile');
			}
			await transport.enqueueOrder(orderId, templateId);
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
		return this.queue.add(async () => {
			const transport = await this.getTransport(profile);
			const bytes = await encodeThermalTemplateForPrint({
				templateXml,
				receiptData,
				maxWidthDots,
				encodeOptions: {
					language: profile.language,
					columns: profile.columns,
					printerModel: profile.printerModel,
					emitEscPrintMode: profile.emitEscPrintMode ?? true,
					openDrawer: profile.autoOpenDrawer,
					drawerConnector: profile.drawerConnector,
				},
			});
			await transport.printRaw(bytes);
		});
	}

	/**
	 * Print HTML via system dialog.
	 */
	async printHtml(html: string): Promise<void> {
		return this.queue.add(async () => {
			const transport = new SystemPrintAdapter();
			await transport.printHtml(html);
		});
	}

	/**
	 * Send a test print to verify connectivity.
	 * System profiles get an HTML test page via the system print dialog.
	 */
	async testPrint(profile: PrinterProfile): Promise<void> {
		if (profile.connectionType === 'system') {
			const html = `<html><body style="font-family:monospace;text-align:center;padding:2em">
        <h2>WCPOS</h2><p>Test Print</p>
        <p>Printer: ${profile.name}</p>
        <p>Connection: System Dialog</p>
        <p>Date: ${new Date().toLocaleString()}</p>
        <br/><p>If you can read this, printing works!</p>
      </body></html>`;
			return this.printHtml(html);
		}

		return this.queue.add(async () => {
			const transport = await this.getTransport(profile);
			const bytes = encodeThermalTemplate(
				buildDiagnosticTemplate(profile.columns),
				{ printerName: profile.name, date: new Date().toLocaleString() },
				{
					language: profile.language,
					columns: profile.columns,
					printerModel: profile.printerModel,
					emitEscPrintMode: profile.emitEscPrintMode ?? true,
				}
			);
			await transport.printRaw(bytes);
		});
	}

	/**
	 * Clean up all transports. Waits for in-flight jobs to finish first.
	 */
	async dispose(): Promise<void> {
		// Prevent new jobs from being accepted
		this.queue.clear();

		// Wait for any currently executing job to complete
		await this.queue.onIdle();

		for (const transport of this.transports.values()) {
			await transport.disconnect?.();
		}
		this.transports.clear();
		this.transportKeys.clear();
	}
}
