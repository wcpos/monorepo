import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleReceiptData } from '../encoder/__tests__/fixtures';
import { PrinterService } from '../printer-service';

import type { PrinterProfile, PrinterTransport } from '../types';

const { encodeReceiptMock } = vi.hoisted(() => ({
	encodeReceiptMock: vi.fn(() => new Uint8Array([1, 2, 3])),
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

describe('PrinterService', () => {
	beforeEach(() => {
		encodeReceiptMock.mockClear();
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
});
