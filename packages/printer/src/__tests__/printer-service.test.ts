import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleReceiptData } from '../encoder/__tests__/fixtures';
import { PrinterService } from '../printer-service';

import type { PrinterProfile, PrinterTransport } from '../types';

const { encodeReceiptMock } = vi.hoisted(() => ({
	encodeReceiptMock: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

const { epsonNativePrintRawMock, starNativePrintRawMock } = vi.hoisted(() => ({
	epsonNativePrintRawMock: vi.fn().mockResolvedValue(undefined),
	starNativePrintRawMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../encoder/encode-receipt', () => ({
	encodeReceipt: encodeReceiptMock,
}));

vi.mock('../transport/system-print-adapter', () => ({
	SystemPrintAdapter: class {
		printRaw = vi.fn().mockResolvedValue(undefined);
		printHtml = vi.fn().mockResolvedValue(undefined);
	},
}));

vi.mock('../transport/epson-native-adapter', () => ({
	EpsonNativeAdapter: class {
		name = 'epson-native';
		printRaw = epsonNativePrintRawMock;
		printHtml = vi.fn().mockResolvedValue(undefined);
	},
}));

vi.mock('../transport/star-native-adapter', () => ({
	StarNativeAdapter: class {
		name = 'star-native';
		printRaw = starNativePrintRawMock;
		printHtml = vi.fn().mockResolvedValue(undefined);
	},
}));

describe('PrinterService', () => {
	beforeEach(() => {
		encodeReceiptMock.mockClear();
		epsonNativePrintRawMock.mockClear();
		starNativePrintRawMock.mockClear();
	});

	it('forwards decimals to encodeReceipt for default thermal printing', async () => {
		const service = new PrinterService();
		const transport: PrinterTransport = {
			name: 'test',
			printRaw: vi.fn().mockResolvedValue(undefined),
			printHtml: vi.fn().mockResolvedValue(undefined),
		};

		(service as any).getTransport = vi.fn().mockResolvedValue(transport);

		const profile: PrinterProfile = {
			id: 'printer-1',
			name: 'Test Printer',
			connectionType: 'network',
			vendor: 'epson',
			address: '127.0.0.1',
			port: 9100,
			printerModel: 'epson-tm-t88vi',
			language: 'esc-pos',
			columns: 48,
			autoPrint: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
			isBuiltIn: false,
		};

		await (service as any).printReceipt(sampleReceiptData, profile, undefined, undefined, 3);

		expect(encodeReceiptMock).toHaveBeenCalledWith(
			sampleReceiptData,
			expect.objectContaining({
				decimals: 3,
			})
		);
	});

	it('routes Epson bluetooth profiles through the native adapter', async () => {
		const service = new PrinterService();
		const profile: PrinterProfile = {
			id: 'epson-bt-1',
			name: 'Epson BT',
			connectionType: 'bluetooth',
			vendor: 'epson',
			address: '01:23:45:67:89:ab',
			port: 0,
			language: 'esc-pos',
			columns: 48,
			autoPrint: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
		};

		await service.printRaw(new Uint8Array([0x1b, 0x40]), profile);

		expect(epsonNativePrintRawMock).toHaveBeenCalledWith(new Uint8Array([0x1b, 0x40]));
		expect(starNativePrintRawMock).not.toHaveBeenCalled();
	});

	it('routes Star USB profiles through the native adapter', async () => {
		const service = new PrinterService();
		const profile: PrinterProfile = {
			id: 'star-usb-1',
			name: 'Star USB',
			connectionType: 'usb',
			vendor: 'star',
			address: 'usb:printer-1',
			port: 0,
			language: 'star-prnt',
			columns: 48,
			autoPrint: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
		};

		await service.printRaw(new Uint8Array([0x1b, 0x40]), profile);

		expect(starNativePrintRawMock).toHaveBeenCalledWith(new Uint8Array([0x1b, 0x40]));
		expect(epsonNativePrintRawMock).not.toHaveBeenCalled();
	});
});
