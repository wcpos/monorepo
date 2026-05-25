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

describe('PrinterService.setCloudEnqueueFactory', () => {
	it('uses a factory set after construction', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const service = new PrinterService();
		service.setCloudEnqueueFactory(() => enqueue);

		await service.printRaw(new Uint8Array([0x1b, 0x40]), cloudProfile);

		expect(enqueue).toHaveBeenCalledWith('reg-7', {
			data: new Uint8Array([0x1b, 0x40]),
			contentType: 'application/octet-stream',
		});
	});

	it('clears a previously set factory', async () => {
		const service = new PrinterService();
		service.setCloudEnqueueFactory(() => vi.fn().mockResolvedValue(undefined));
		service.setCloudEnqueueFactory(undefined);

		await expect(service.printRaw(new Uint8Array([0x1b, 0x40]), cloudProfile)).rejects.toThrow(
			'no cloudEnqueueFactory provided'
		);
	});

	it('keeps the cached cloud transport when the same factory is set again', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const cloudEnqueueFactory = vi.fn(() => enqueue);
		const service = new PrinterService({ cloudEnqueueFactory });

		await service.printRaw(new Uint8Array([0x1b, 0x40]), cloudProfile);
		service.setCloudEnqueueFactory(cloudEnqueueFactory);
		await service.printRaw(new Uint8Array([0x1d, 0x56]), cloudProfile);

		expect(cloudEnqueueFactory).toHaveBeenCalledTimes(1);
		expect(enqueue).toHaveBeenCalledTimes(2);
	});
});
