import { printerLogger } from '../logger';
import { BLE_PREFIX } from '../transport/device-key';
import { EpsonNativeAdapter } from '../transport/epson-native-adapter';
import { identifyModel } from './identify-models';

type PaperWidthMm = 58 | 60 | 70 | 76 | 80;

export function columnsForPaperWidthMm(mm: PaperWidthMm): number {
	switch (mm) {
		case 80:
			return 48; // 80 mm paper at 12-dot Font A pitch.
		case 76:
			return 45; // 76 mm paper at 12-dot Font A pitch.
		case 70:
			return 42; // 70 mm paper at 12-dot Font A pitch.
		case 60:
			return 35; // 60 mm paper at 12-dot Font A pitch.
		case 58:
			return 32; // 58 mm paper at 12-dot Font A pitch.
	}
}

export async function resolveNativePrinterColumns(input: {
	address: string;
	connectionType: 'network' | 'bluetooth' | 'usb';
	vendor?: 'epson' | 'star' | 'generic';
	name?: string;
}): Promise<{ columns: number | undefined; source: 'printer' | 'model' | 'default' }> {
	printerLogger.debug('Printer columns query started', { context: { ...input } });
	// A generic BLE printer answers no width query and its advertised name is rarely a model the
	// table knows, so the flow asks the merchant instead of guessing from a near-miss name match.
	// Whatever vendor the form later settles on, a `ble:` target is the generic GATT lane.
	if (input.address.startsWith(BLE_PREFIX)) {
		printerLogger.info('Printer columns resolved', {
			context: { ...input, columns: undefined, source: 'default' },
		});
		return { columns: undefined, source: 'default' };
	}
	let columns: number | undefined;
	let source: 'printer' | 'model' | 'default' = 'default';
	const isNativeEpson =
		(input.vendor === 'epson' && ['bluetooth', 'usb'].includes(input.connectionType)) ||
		(input.connectionType === 'network' && /^TCPS?:/i.test(input.address));
	if (isNativeEpson) {
		try {
			const width = await new EpsonNativeAdapter(
				input.address,
				input.connectionType
			).getPaperWidthMm();
			if (width) {
				columns = columnsForPaperWidthMm(width);
				source = 'printer';
			}
		} catch {
			// The adapter normally swallows SDK errors; mocked or alternate adapters may still throw.
		}
	}
	if (columns === undefined) {
		columns = identifyModel(input.name).columns;
		if (columns !== undefined) source = 'model';
	}
	printerLogger.info('Printer columns resolved', { context: { ...input, columns, source } });
	return { columns, source };
}
