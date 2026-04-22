import type { DiscoveredPrinter, PrinterProfile } from '@wcpos/printer';

export interface PrinterProfileFormData {
	name: string;
	vendor: PrinterProfile['vendor'];
	address: string;
	port: number;
	language: PrinterProfile['language'];
	columns: number;
	autoPrint: boolean;
	autoCut: boolean;
	autoOpenDrawer: boolean;
	isDefault: boolean;
}

export type PrinterDialogPrefill = Partial<
	Pick<
		DiscoveredPrinter,
		'name' | 'address' | 'port' | 'vendor' | 'connectionType' | 'nativeInterfaceType'
	>
>;

interface PrinterProfileSeed {
	printer?: {
		connectionType: PrinterProfile['connectionType'];
		nativeInterfaceType?: string;
	};
	prefill?: {
		connectionType?: PrinterDialogPrefill['connectionType'];
		nativeInterfaceType?: string;
	};
}

function resolvePrinterTransport({
	printer,
	prefill,
}: PrinterProfileSeed): Pick<PrinterProfile, 'connectionType' | 'nativeInterfaceType'> {
	return {
		connectionType: printer?.connectionType ?? prefill?.connectionType ?? 'network',
		nativeInterfaceType: printer?.nativeInterfaceType ?? prefill?.nativeInterfaceType,
	};
}

export function buildPrinterProfileFields(
	data: PrinterProfileFormData,
	seed: PrinterProfileSeed = {}
): Omit<PrinterProfile, 'id' | 'isBuiltIn'> {
	const transport = resolvePrinterTransport(seed);

	return {
		name: data.name,
		connectionType: transport.connectionType,
		vendor: data.vendor,
		address: data.address || '',
		port: data.port,
		...(transport.nativeInterfaceType
			? { nativeInterfaceType: transport.nativeInterfaceType }
			: {}),
		language: data.language,
		columns: data.columns,
		autoPrint: data.autoPrint,
		autoCut: data.autoCut,
		autoOpenDrawer: data.autoOpenDrawer,
		isDefault: data.isDefault,
	};
}
