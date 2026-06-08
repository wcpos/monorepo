import type { PrinterProfile } from '@wcpos/printer';

type CloudProvider = NonNullable<PrinterProfile['cloudProvider']>;

export interface CloudPrinterPayload {
	id?: string;
	cloudPrinterId?: string;
	printer_id?: string;
	name?: string;
	provider?: CloudProvider;
	cloudProvider?: CloudProvider;
	columns?: number;
	language?: PrinterProfile['language'];
	autoCut?: boolean;
	fullReceiptRaster?: boolean;
}

export type CloudPrintResponse =
	| CloudPrinterPayload[]
	| {
			printers?:
				| CloudPrinterPayload[]
				| CloudPrinterPayload
				| Record<string, CloudPrinterPayload>
				| null;
	  };

const SYSTEM_PRINTER: PrinterProfile = {
	id: 'system',
	name: 'Print Dialog',
	connectionType: 'system',
	vendor: 'generic',
	address: '',
	port: 9100,
	language: 'esc-pos',
	columns: 42,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: false,
	isBuiltIn: true,
};
const LEGACY_SYSTEM_PRINTER_ID = '__system__';

function isCloudPrinterPayload(value: unknown): value is CloudPrinterPayload {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCloudPayload(payload: CloudPrintResponse | null): CloudPrinterPayload[] {
	if (!payload) return [];
	if (Array.isArray(payload)) return payload;
	if (!payload.printers) return [];
	if (Array.isArray(payload.printers)) return payload.printers;
	const printers = payload.printers;
	const printerId = printers.cloudPrinterId ?? printers.id ?? printers.printer_id;
	if (typeof printerId === 'string' && printerId.length > 0) {
		return [printers];
	}
	const printerEntries = Object.entries(printers);
	if (printerEntries.every(([, printer]) => isCloudPrinterPayload(printer))) {
		return printerEntries.map(([key, printer]) => ({
			...printer,
			printer_id: printer.printer_id ?? printer.id ?? printer.cloudPrinterId ?? key,
		}));
	}
	return Object.values(printers);
}

function synthesizeCloudPrinter(payload: CloudPrinterPayload): PrinterProfile | null {
	const cloudPrinterId = payload.cloudPrinterId ?? payload.id ?? payload.printer_id;
	if (!cloudPrinterId) return null;
	const cloudProvider = payload.cloudProvider ?? payload.provider;

	return {
		id: `cloud:${cloudPrinterId}`,
		name: payload.name ?? cloudPrinterId,
		connectionType: 'cloud',
		vendor: cloudProvider === 'star-cloudprnt' ? 'star' : 'generic',
		address: '',
		port: 9100,
		language: payload.language ?? 'esc-pos',
		columns: payload.columns ?? 42,
		fullReceiptRaster: payload.fullReceiptRaster ?? false,
		autoCut: payload.autoCut ?? true,
		autoOpenDrawer: false,
		isDefault: false,
		isBuiltIn: true,
		cloudPrinterId,
		...(cloudProvider ? { cloudProvider } : {}),
	};
}

export function mergeAvailablePrinterProfiles(
	localProfiles: PrinterProfile[],
	cloudPayload: CloudPrintResponse | null
): PrinterProfile[] {
	const legacySystemProfile = localProfiles.find(
		(profile) => profile.id === LEGACY_SYSTEM_PRINTER_ID
	);
	const profiles = localProfiles.filter((profile) => profile.id !== LEGACY_SYSTEM_PRINTER_ID);
	if (!profiles.some((profile) => profile.id === SYSTEM_PRINTER.id)) {
		profiles.push({
			...SYSTEM_PRINTER,
			isDefault: legacySystemProfile?.isDefault ?? SYSTEM_PRINTER.isDefault,
		});
	}

	for (const cloudPrinter of normalizeCloudPayload(cloudPayload)) {
		const profile = synthesizeCloudPrinter(cloudPrinter);
		if (profile && !profiles.some((existing) => existing.id === profile.id)) {
			profiles.push(profile);
		}
	}

	return profiles;
}
