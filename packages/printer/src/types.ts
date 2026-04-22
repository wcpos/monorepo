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
	printRaw(data: Uint8Array): Promise<void>;

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

	/** Disconnect / clean up resources */
	disconnect?(): Promise<void>;
}

/**
 * Discovered printer from network/BLE/USB scan.
 */
export interface DiscoveredPrinter {
	id: string;
	name: string;
	connectionType: 'network' | 'bluetooth' | 'usb';
	address: string;
	port?: number;
	vendor?: 'epson' | 'star' | 'generic';
	/** Vendor-native interface hint (for example Star BluetoothLE vs Bluetooth). */
	nativeInterfaceType?: string;
}

/**
 * Persisted printer profile — user-configured printer.
 */
export interface PrinterProfile {
	id: string;
	name: string;
	connectionType: 'network' | 'bluetooth' | 'usb' | 'system';
	vendor: 'epson' | 'star' | 'generic';
	address?: string;
	port: number;
	/** Persisted vendor-native interface hint used by native adapters. */
	nativeInterfaceType?: string;
	printerModel?: string;
	language: 'esc-pos' | 'star-prnt' | 'star-line';
	columns: number;
	autoPrint: boolean;
	autoCut: boolean;
	autoOpenDrawer: boolean;
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
