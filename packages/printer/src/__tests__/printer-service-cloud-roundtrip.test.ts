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
	id: 'c1',
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
	cloudPrinterId: 'reg-9',
};

describe('PrinterService cloud round-trip', () => {
	it('sends pre-encoded bytes for a cloud profile to the enqueue factory', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const service = new PrinterService({ cloudEnqueueFactory: () => enqueue });

		await service.printRaw(new Uint8Array([1, 2, 3]), cloudProfile);

		expect(enqueue).toHaveBeenCalledWith('reg-9', {
			data: new Uint8Array([1, 2, 3]),
			contentType: 'application/octet-stream',
		});
	});
});
