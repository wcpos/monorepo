import * as z from 'zod';

export interface PrinterFormValues {
	name: string;
	connectionType: 'network' | 'bluetooth' | 'usb' | 'cloud';
	vendor: 'epson' | 'star' | 'generic';
	address: string;
	cloudPrinterId?: string;
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
	cloudPrinterId: '',
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
	cloudPrinterId: z.string().optional(),
};

/** Web: Epson/Star; network or (capability-permitting) USB/Bluetooth via WebUSB/Web Bluetooth. */
export const webPrinterSchema = z.object({
	...baseShape,
	connectionType: z.enum(['network', 'usb', 'bluetooth']).default('network'),
	vendor: z.enum(['epson', 'star']).default('epson'),
	address: z.string().min(1, 'A printer address or device is required'),
});

/** Electron: all vendors; network, USB (raw libusb), or Bluetooth (Web Bluetooth). */
export const electronPrinterSchema = z.object({
	...baseShape,
	connectionType: z.enum(['network', 'usb', 'bluetooth']).default('network'),
	vendor: z.enum(['epson', 'star', 'generic']).default('generic'),
	address: z.string().min(1, 'A printer address or device is required'),
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

/** Cloud: a registered plugin printer chosen by id, no address. */
export const cloudPrinterSchema = z.object({
	...baseShape,
	connectionType: z.literal('cloud').default('cloud'),
	vendor: z.enum(['epson', 'star', 'generic']).default('generic'),
	address: z.string().optional().default(''),
	cloudPrinterId: z.string().min(1, 'Select a cloud printer'),
});

/** Native app dialog: local native transports or plugin-registered cloud printers. */
export const nativeOrCloudPrinterSchema = z.union([nativePrinterSchema, cloudPrinterSchema]);
