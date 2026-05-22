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

function cloudProfile(overrides: Partial<PrinterProfile> = {}): PrinterProfile {
	return {
		id: 'cloud-1',
		name: 'Kitchen (cloud)',
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
		cloudPrinterId: 'plugin-printer-7',
		...overrides,
	};
}

describe('PrinterService cloud routing', () => {
	it('routes a cloud profile through the injected enqueue factory', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const cloudEnqueueFactory = vi.fn().mockReturnValue(enqueue);
		const service = new PrinterService({ cloudEnqueueFactory });

		await service.printRaw(new Uint8Array([0x1b, 0x40]), cloudProfile());

		expect(cloudEnqueueFactory).toHaveBeenCalledOnce();
		expect(enqueue).toHaveBeenCalledWith('plugin-printer-7', {
			data: new Uint8Array([0x1b, 0x40]),
			contentType: 'application/octet-stream',
		});
	});

	it('throws when no cloudEnqueueFactory is configured', async () => {
		const service = new PrinterService();

		await expect(service.printRaw(new Uint8Array([0x01]), cloudProfile())).rejects.toThrow(
			'Cloud printing is not configured'
		);
	});

	it('throws when a cloud profile has no cloudPrinterId', async () => {
		const cloudEnqueueFactory = vi.fn();
		const service = new PrinterService({ cloudEnqueueFactory });

		await expect(
			service.printRaw(new Uint8Array([0x01]), cloudProfile({ cloudPrinterId: undefined }))
		).rejects.toThrow('missing a cloudPrinterId');
	});
});
