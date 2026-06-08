import type { PrinterProfile } from '@wcpos/printer';
import type { PrinterProfileDocument } from '@wcpos/database';

/**
 * Converts an RxDB printer profile document into a plain PrinterProfile object.
 */
export function toPrinterProfile(doc: PrinterProfileDocument): PrinterProfile {
	return {
		id: doc.id,
		name: doc.name,
		connectionType: doc.connectionType as PrinterProfile['connectionType'],
		vendor: (doc.vendor ?? 'generic') as PrinterProfile['vendor'],
		address: doc.address,
		port: doc.port ?? 9100,
		nativeInterfaceType: doc.nativeInterfaceType,
		cloudPrinterId: doc.cloudPrinterId,
		cloudProvider: doc.cloudProvider,
		language: (doc.language ?? 'esc-pos') as PrinterProfile['language'],
		columns: doc.columns ?? 42,
		fullReceiptRaster: doc.fullReceiptRaster ?? false,
		autoCut: doc.autoCut ?? true,
		autoOpenDrawer: doc.autoOpenDrawer ?? false,
		isDefault: doc.isDefault ?? false,
		isBuiltIn: doc.isBuiltIn ?? false,
	};
}
