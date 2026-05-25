import { describe, expect, it, vi } from 'vitest';

import { PrinterService } from '../printer-service';

import type { PrinterProfile } from '../types';

vi.mock('../transport/system-print-adapter', () => ({
	SystemPrintAdapter: class {
		name = 'system';
		printRaw = vi.fn().mockResolvedValue(undefined);
		printHtml = vi.fn().mockResolvedValue(undefined);
	},
}));

const cloudProfile: PrinterProfile = {
	id: 'cloud-1',
	name: 'Cloud',
	connectionType: 'cloud',
	vendor: 'generic',
	port: 9100,
	language: 'esc-pos',
	columns: 42,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: false,
	isBuiltIn: false,
	cloudPrinterId: 'reg-7',
};

describe('PrinterService cloud factory replacement', () => {
	it('uses a new enqueue function after the cloud factory is replaced', async () => {
		const firstEnqueue = vi.fn().mockResolvedValue(undefined);
		const nextEnqueue = vi.fn().mockResolvedValue(undefined);
		const service = new PrinterService({ cloudEnqueueFactory: () => firstEnqueue });

		await service.printRaw(new Uint8Array([1]), cloudProfile);
		service.setCloudEnqueueFactory(() => nextEnqueue);
		await service.printRaw(new Uint8Array([2]), cloudProfile);

		expect(firstEnqueue).toHaveBeenCalledTimes(1);
		expect(nextEnqueue).toHaveBeenCalledWith('reg-7', {
			data: new Uint8Array([2]),
			contentType: 'application/octet-stream',
		});
	});
});
