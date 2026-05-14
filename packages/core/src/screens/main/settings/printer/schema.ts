import * as z from 'zod';

export interface PrinterFormValues {
	name: string;
	connectionType: 'network' | 'bluetooth' | 'usb';
	vendor: 'epson' | 'star' | 'generic';
	address: string;
	port: number;
	language: 'esc-pos' | 'star-prnt' | 'star-line';
	columns: number;
	emitEscPrintMode: boolean;
	fullReceiptRaster: boolean;
	autoCut: boolean;
	autoOpenDrawer: boolean;
	isDefault: boolean;
	/** Star native interface hint (BLE vs Classic) — carried from the device picker, no UI control. */
	nativeInterfaceType?: string;
}

/** Vendor option for the options-driven VendorSelect (shared by web/electron/native entries). */
export interface VendorOption {
	value: 'epson' | 'star' | 'generic';
	label: string;
}

export const DEFAULT_FORM_VALUES: PrinterFormValues = {
	name: '',
	connectionType: 'network',
	vendor: 'generic',
	address: '',
	port: 9100,
	language: 'esc-pos',
	columns: 42,
	emitEscPrintMode: true,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: true,
};

const baseShape = {
	name: z.string().min(1),
	port: z.coerce.number().int().min(1).max(65535).default(9100),
	language: z.enum(['esc-pos', 'star-prnt', 'star-line']).default('esc-pos'),
	columns: z.coerce.number().int().min(1).default(42),
	emitEscPrintMode: z.boolean().default(true),
	fullReceiptRaster: z.boolean().default(false),
	autoCut: z.boolean().default(true),
	autoOpenDrawer: z.boolean().default(false),
	isDefault: z.boolean().default(true),
	nativeInterfaceType: z.string().optional(),
};

/** Web: Epson/Star only, network only. */
export const webPrinterSchema = z.object({
	...baseShape,
	connectionType: z.literal('network').default('network'),
	vendor: z.enum(['epson', 'star']).default('epson'),
	address: z.string().min(1, 'IP address is required'),
});

/** Electron: all vendors, network only. */
export const electronPrinterSchema = z.object({
	...baseShape,
	connectionType: z.literal('network').default('network'),
	vendor: z.enum(['epson', 'star', 'generic']).default('generic'),
	address: z.string().min(1, 'IP address is required'),
});

/** Native: all vendors, all connection types. BT/USB require Epson/Star + an address. */
export const nativePrinterSchema = z
	.object({
		...baseShape,
		connectionType: z.enum(['network', 'bluetooth', 'usb']).default('network'),
		vendor: z.enum(['epson', 'star', 'generic']).default('generic'),
		address: z.string().min(1, 'A printer address or device is required'),
	})
	.refine((v) => v.connectionType === 'network' || v.vendor === 'epson' || v.vendor === 'star', {
		path: ['vendor'],
		message: 'Bluetooth and USB printers must be Epson or Star',
	});
