import type { DiscoveredPrinter, PrinterProfile } from '@wcpos/printer';

export interface PrinterProfileFormData {
	name: string;
	connectionType?: PrinterProfile['connectionType'];
	nativeInterfaceType?: string;
	vendor: PrinterProfile['vendor'];
	address: string;
	port: number;
	language: PrinterProfile['language'];
	columns: number;
	emitEscPrintMode: boolean;
	fullReceiptRaster: boolean;
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
	data,
	printer,
	prefill,
}: {
	data: { connectionType?: PrinterProfile['connectionType']; nativeInterfaceType?: string };
	printer?: PrinterProfileSeed['printer'];
	prefill?: PrinterProfileSeed['prefill'];
}): Pick<PrinterProfile, 'connectionType' | 'nativeInterfaceType'> {
	return {
		connectionType:
			data.connectionType ?? printer?.connectionType ?? prefill?.connectionType ?? 'network',
		nativeInterfaceType:
			data.nativeInterfaceType ?? printer?.nativeInterfaceType ?? prefill?.nativeInterfaceType,
	};
}

export function buildPrinterProfileFields(
	data: PrinterProfileFormData,
	seed: PrinterProfileSeed = {}
): Omit<PrinterProfile, 'id' | 'isBuiltIn'> {
	const transport = resolvePrinterTransport({ data, printer: seed.printer, prefill: seed.prefill });

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
		emitEscPrintMode: data.emitEscPrintMode,
		fullReceiptRaster: data.fullReceiptRaster,
		autoCut: data.autoCut,
		autoOpenDrawer: data.autoOpenDrawer,
		isDefault: data.isDefault,
	};
}
