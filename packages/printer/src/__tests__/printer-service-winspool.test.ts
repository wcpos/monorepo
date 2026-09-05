import { afterEach, expect, it, vi } from 'vitest';

import { sampleReceiptData } from '../encoder/__tests__/fixtures';
import { PrinterService } from '../printer-service';

import type { PrinterProfile } from '../types';

const { printHtml } = vi.hoisted(() => ({ printHtml: vi.fn(async () => {}) }));
vi.mock('../transport/system-print-adapter', () => ({
	SystemPrintAdapter: class {
		printHtml = printHtml;
	},
}));
vi.mock('../transport/device-adapter', () => import('../transport/device-adapter.electron'));
vi.mock('../logger', () => ({
	isVerboseDiagnostics: () => false,
	printerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

afterEach(() => {
	Reflect.deleteProperty(window, 'ipcRenderer');
	printHtml.mockClear();
});

it.each(['test', 'receipt'] as const)(
	'prints a winspool %s directly to its queue',
	async (kind) => {
		const invoke = vi.fn(async () => {});
		Reflect.set(window, 'ipcRenderer', { invoke });
		const profile: PrinterProfile = {
			id: 'queue',
			name: 'Receipt',
			connectionType: 'system',
			address: 'winspool:Receipt',
			vendor: 'generic',
			port: 9100,
			language: 'esc-pos',
			columns: 42,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
			isBuiltIn: false,
		};
		const service = new PrinterService();
		if (kind === 'test') await service.testPrint(profile, { openDrawer: false });
		else await service.printReceipt(sampleReceiptData, profile);
		expect(invoke).toHaveBeenCalledWith('print-raw-usb', {
			device: 'winspool:Receipt',
			data: expect.any(Uint8Array),
		});
		expect(printHtml).not.toHaveBeenCalled();
		await service.dispose();
	}
);
