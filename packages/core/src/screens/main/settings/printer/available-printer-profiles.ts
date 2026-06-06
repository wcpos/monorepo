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

export type CloudPrintResponse = CloudPrinterPayload[] | { printers?: CloudPrinterPayload[] };

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

function normalizeCloudPayload(payload: CloudPrintResponse | null): CloudPrinterPayload[] {
	if (!payload) return [];
	if (Array.isArray(payload)) return payload;
	return payload.printers ?? [];
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
	const profiles = [...localProfiles];
	if (!profiles.some((profile) => profile.id === SYSTEM_PRINTER.id)) {
		profiles.push(SYSTEM_PRINTER);
	}

	for (const cloudPrinter of normalizeCloudPayload(cloudPayload)) {
		const profile = synthesizeCloudPrinter(cloudPrinter);
		if (profile && !profiles.some((existing) => existing.id === profile.id)) {
			profiles.push(profile);
		}
	}

	return profiles;
}
