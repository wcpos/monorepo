/// <reference path="./types/receipt-printer-encoder.d.ts" />
import PQueue from 'p-queue';

import { buildDiagnosticTemplate } from './encoder/diagnostic-template';
import { encodeReceipt } from './encoder/encode-receipt';
import { formatReceiptData } from './encoder/format-receipt-data';
import { encodeThermalTemplate } from './renderer';
import { SystemPrintAdapter } from './transport/system-print-adapter';

import type { EncodeReceiptOptions } from './encoder/encode-receipt';
import type { ReceiptData } from './encoder/types';
import type { PrinterProfile, PrinterTransport } from './types';

/** Cache key that captures config-relevant fields so stale transports are evicted. */
function transportKey(profile: PrinterProfile): string {
	return `${profile.id}:${profile.connectionType}:${profile.address ?? ''}:${profile.port}:${profile.vendor}:${profile.nativeInterfaceType ?? ''}`;
}

export class PrinterService {
	private queue = new PQueue({ concurrency: 1 });
	private transports = new Map<string, PrinterTransport>();
	/** Tracks the config fingerprint used to create each cached transport. */
	private transportKeys = new Map<string, string>();

	/**
	 * Get or create a transport for the given profile.
	 * Recreates the transport if the profile config has changed since last use.
	 * NetworkAdapter is loaded lazily to avoid triggering NativeEventEmitter at import time.
	 */
	private async getTransport(profile: PrinterProfile): Promise<PrinterTransport> {
		const key = transportKey(profile);
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
				if (!profile.address) {
					throw new Error(`Native printer profile is missing an address for ${profile.name}`);
				}

				if (profile.vendor === 'epson') {
					const { EpsonNativeAdapter } = await import('./transport/epson-native-adapter');
					transport = new EpsonNativeAdapter(profile.address, profile.connectionType);
					break;
				}

				if (profile.vendor === 'star') {
					const { StarNativeAdapter } = await import('./transport/star-native-adapter');
					transport = new StarNativeAdapter(
						profile.address,
						profile.connectionType,
						profile.nativeInterfaceType
					);
					break;
				}

				throw new Error(
					`Unsupported native printer vendor for ${profile.connectionType}: ${profile.vendor}`
				);
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
			};

			let bytes: Uint8Array;
			if (templateXml) {
				const templateData = formatReceiptData(receiptData);
				bytes = encodeThermalTemplate(templateXml, templateData, encoderOptions);
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
