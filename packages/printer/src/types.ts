import type {
	DrawerConnector,
	EscposRenderOptions,
	ThermalBarcodeImages,
	ThermalBarcodeMode,
	ThermalImageAssets,
} from '@wcpos/receipt-renderer';

import type { PrinterIdentity } from './discovery/identify';
import type { PrinterStatus } from './transport/escpos-status';

export type { DrawerConnector };

export interface PrintRawOptions {
	/** Whether transports that add their own cutter command should include it. */
	cutPaper?: boolean;
}

/** What a logged print dispatch carries: bytes for raw, markup characters for a job. */
export type PrintJobShape =
	{ kind: 'raw'; bytes: number } | { kind: 'markup'; markupLength: number };

export interface MarkupPrintJob {
	template: string;
	data: Record<string, unknown>;
	options: EscposRenderOptions & {
		imageAssets?: ThermalImageAssets;
		barcodeImages?: ThermalBarcodeImages;
		barcodeMode?: ThermalBarcodeMode;
	};
}
/**
 * Transport adapter — sends bytes to a physical printer.
 */
export interface PrinterTransport {
	/** Human-readable transport name for logging */
	readonly name: string;

	/**
	 * Send raw bytes (ESC/POS, StarPRNT, etc.) to the printer.
	 * Resolves when the printer acknowledges receipt or the data is sent.
	 */
	printRaw(data: Uint8Array, options?: PrintRawOptions): Promise<void>;
	printMarkup?(job: MarkupPrintJob): Promise<void>;
	supportsMarkup?(): Promise<boolean> | boolean;

	/**
	 * Print HTML content via system print dialog.
	 * Used as fallback when no direct printer is configured.
	 */
	printHtml(html: string): Promise<void>;

	/**
	 * Send cash drawer kick command.
	 * Some transports include this in printRaw; this is for standalone kicks.
	 */
	openCashDrawer?(): Promise<void>;

	/**
	 * Ask the printer for its real-time status (`DLE EOT`). Resolves null when this lane cannot
	 * ask — a write-only channel, or a BLE profile with no notify characteristic (audit D4).
	 * Never throws: a status read is a nicety and must not fail the print it followed.
	 */
	queryStatus?(): Promise<PrinterStatus | null>;

	/** Disconnect / clean up resources */
	disconnect?(): Promise<void>;
}

/**
 * Discovered printer from platform discovery. Electron may report system-backed
 * spooler queues; cloud printers are synthesized elsewhere, not scanned.
 */
export interface DiscoveredPrinter {
	id: string;
	name: string;
	connectionType: 'network' | 'bluetooth' | 'usb' | 'system';
	address: string;
	port?: number;
	vendor?: 'epson' | 'star' | 'generic';
	identity?: PrinterIdentity;
	/** Vendor-native interface hint (for example Star BluetoothLE vs Bluetooth). */
	nativeInterfaceType?: string;
	/**
	 * Vendor-SDK encrypted network target for the same printer (Epson `TCPS:<mac>[local_printer]`),
	 * kept on the printer's one network row so a lane can pick it under Secure Printing.
	 */
	secureTarget?: string;
}

/**
 * Persisted printer profile — user-configured printer.
 */
export interface PrinterProfile {
	id: string;
	name: string;
	connectionType: 'network' | 'bluetooth' | 'usb' | 'system' | 'cloud';
	vendor: 'epson' | 'star' | 'generic';
	address?: string;
	port: number;
	/** Persisted vendor-native interface hint used by native adapters. */
	nativeInterfaceType?: string;
	/** For `connectionType: 'cloud'`: the WCPOS plugin-side registered cloud printer ID. */
	cloudPrinterId?: string;
	/**
	 * For `connectionType: 'cloud'`: the server-side print provider backing the
	 * registered cloud printer. Drives how jobs are delivered:
	 * - `star-cloudprnt` — the printer polls, and the server renders the receipt
	 *   at fetch time in whatever media type the printer says it can decode.
	 *   Formerly a raw ESC/POS upload, which no Star CloudPRNT printer can
	 *   actually decode (wcpos/woocommerce-pos#1350, #1351).
	 * - `epson-sdp` / `printnode` — raw payloads are rejected/never delivered; the
	 *   server must render & submit an order-based job instead.
	 * Absent/unknown profiles fall back to the raw-payload behaviour, which is
	 * what a profile written before this field existed was built for.
	 */
	cloudProvider?: 'star-cloudprnt' | 'epson-sdp' | 'printnode';
	printerModel?: string;
	language: 'esc-pos' | 'star-prnt' | 'star-line';
	columns: number;
	/**
	 * ESC/POS code page for receipt text, named as the encoder library expects ('cp437',
	 * 'cp1252', 'cp936'…). Absent means the encoder picks a page per string, which is right for
	 * Latin receipts and wrong for a printer whose character tables are a Chinese, Thai or
	 * Cyrillic set — that receipt prints as question marks (gotcha N38).
	 */
	codePage?: string;
	/**
	 * Emit `ESC !` print-mode bytes alongside `GS !` size bytes.
	 * Default `true`. Some printers and simulators only honour one of the two
	 * size commands; emitting both maximizes compatibility. Disable as an
	 * escape hatch for printers that misbehave when both are sent.
	 */
	emitEscPrintMode?: boolean;
	fullReceiptRaster: boolean;
	autoCut: boolean;
	autoOpenDrawer: boolean;
	/** Cash-drawer connector used for drawer kick pulses. Defaults to pin2 (drawer 1). */
	drawerConnector?: DrawerConnector;
	isDefault: boolean;
	isBuiltIn: boolean;
}

/**
 * Print job passed to the PrinterService.
 */
export interface PrintJob {
	id: string;
	type: 'receipt' | 'report' | 'test';
	/** Pre-encoded bytes — if provided, skip encoding */
	data?: Uint8Array;
	/** HTML content for system print fallback */
	html?: string;
	/** Receipt URL for legacy system print */
	url?: string;
	/** Printer profile to use. If omitted, uses default. */
	profileId?: string;
}

/**
 * Result from usePrint hook.
 */
export interface UsePrintResult {
	/** Trigger a print. Resolves when complete or queued. */
	print: () => Promise<void>;
	/** Whether a print job is currently in progress. */
	isPrinting: boolean;
}

/** Stable discovery error codes — the UI maps these to translated strings. */
export type DiscoveryErrorCode =
	| 'usb-none-found'
	| 'bt-none-found'
	| 'bt-connect-failed'
	| 'network-none-found'
	| 'ipc-unavailable'
	| 'discovery-failed';

/** Structured error from a printer discovery operation. */
export interface DiscoveryError {
	code: DiscoveryErrorCode;
	/** Optional extra context when available — most useful for 'discovery-failed' (underlying exception message). */
	detail?: string;
}

/** A Web Bluetooth chooser candidate forwarded from the Electron main process. */
export interface BluetoothCandidate {
	id: string;
	name: string;
}

interface UsbDiscoveryCapabilities {
	connectUsbDevice: () => void | Promise<void>;
	isUsbScanning: boolean;
}

interface BluetoothDiscoveryCapabilities {
	connectBluetoothDevice: () => void;
	isBluetoothScanning: boolean;
	bluetoothCandidates: BluetoothCandidate[];
	selectBluetoothCandidate: (id: string) => void;
	cancelBluetoothScan: () => void;
}

interface SerialDiscoveryCapabilities {
	connectSerialDevice: () => Promise<void>;
	isSerialScanning: boolean;
}

export interface PrinterDiscovery
	extends
		Partial<UsbDiscoveryCapabilities>,
		Partial<BluetoothDiscoveryCapabilities>,
		Partial<SerialDiscoveryCapabilities> {
	printers: DiscoveredPrinter[];
	isScanning: boolean;
	scanCandidates: string[];
	scanProgress: { tested: number; total: number };
	startScan: () => Promise<void>;
	stopScan: () => void | Promise<void>;
	addManualPrinter: (
		name: string,
		address: string,
		port?: number,
		vendor?: 'epson' | 'star' | 'generic'
	) => void;
	removeDiscoveredPrinter: (id: string) => void;
	error: DiscoveryError | null;
}
