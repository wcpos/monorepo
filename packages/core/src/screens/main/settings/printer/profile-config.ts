import type { DiscoveredPrinter, PrinterProfile } from '@wcpos/printer';

export interface PrinterProfileFormData {
	name: string;
	connectionType?: PrinterProfile['connectionType'];
	nativeInterfaceType?: string;
	vendor: PrinterProfile['vendor'];
	address: string;
	cloudPrinterId?: string;
	cloudProvider?: PrinterProfile['cloudProvider'];
	port: number;
	language: PrinterProfile['language'];
	columns: number;
	emitEscPrintMode: boolean;
	fullReceiptRaster: boolean;
	autoCut: boolean;
	autoOpenDrawer: boolean;
	drawerConnector?: PrinterProfile['drawerConnector'];
	isDefault: boolean;
}

export type PrinterDialogPrefill = Partial<
	Omit<
		Pick<
			DiscoveredPrinter,
			'name' | 'address' | 'port' | 'vendor' | 'connectionType' | 'nativeInterfaceType'
		>,
		'connectionType'
	> & {
		connectionType: PrinterProfile['connectionType'];
		cloudPrinterId: string;
		cloudProvider: PrinterProfile['cloudProvider'];
	}
>;

interface PrinterProfileSeed {
	printer?: {
		connectionType: PrinterProfile['connectionType'];
		nativeInterfaceType?: string;
		cloudPrinterId?: string;
		cloudProvider?: PrinterProfile['cloudProvider'];
	};
	prefill?: {
		connectionType?: PrinterDialogPrefill['connectionType'];
		nativeInterfaceType?: string;
		cloudPrinterId?: string;
		cloudProvider?: PrinterProfile['cloudProvider'];
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
	const resolvedCloudPrinterId =
		data.cloudPrinterId || seed.printer?.cloudPrinterId || seed.prefill?.cloudPrinterId;
	const cloudPrinterId =
		transport.connectionType === 'cloud' && resolvedCloudPrinterId
			? resolvedCloudPrinterId
			: undefined;
	const resolvedCloudProvider =
		data.cloudProvider || seed.printer?.cloudProvider || seed.prefill?.cloudProvider;
	const cloudProvider =
		transport.connectionType === 'cloud' && resolvedCloudProvider
			? resolvedCloudProvider
			: undefined;

	return {
		name: data.name,
		connectionType: transport.connectionType,
		...(cloudPrinterId ? { cloudPrinterId } : {}),
		...(cloudProvider ? { cloudProvider } : {}),
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
		drawerConnector: data.drawerConnector ?? 'pin2',
		isDefault: data.isDefault,
	};
}
