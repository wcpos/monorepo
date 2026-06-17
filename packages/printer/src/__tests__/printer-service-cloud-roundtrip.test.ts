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
			kind: 'raw',
			data: new Uint8Array([1, 2, 3]),
			contentType: 'application/octet-stream',
		});
	});

	it('sends raw ESC/POS bytes as application/octet-stream for a star-cloudprnt profile', async () => {
		// Phase 5 regression lock: Star CloudPRNT is the shipped happy path — the
		// printer polls and receives raw bytes. Adding `cloudProvider` must not change it.
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const service = new PrinterService({ cloudEnqueueFactory: () => enqueue });
		const starProfile: PrinterProfile = {
			...cloudProfile,
			cloudProvider: 'star-cloudprnt',
		};

		await service.printRaw(new Uint8Array([0x1b, 0x40, 0x0a]), starProfile);

		expect(enqueue).toHaveBeenCalledWith('reg-9', {
			kind: 'raw',
			data: new Uint8Array([0x1b, 0x40, 0x0a]),
			contentType: 'application/octet-stream',
		});
	});

	it('enqueues an order-based job (no payload) via printOrderViaCloud', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const service = new PrinterService({ cloudEnqueueFactory: () => enqueue });
		const epsonProfile: PrinterProfile = {
			...cloudProfile,
			vendor: 'epson',
			cloudProvider: 'epson-sdp',
		};

		await service.printOrderViaCloud(epsonProfile, 1234, '57');

		expect(enqueue).toHaveBeenCalledWith('reg-9', {
			kind: 'order',
			orderId: 1234,
			templateId: '57',
			autoOpenDrawer: false,
		});
	});

	it('carries drawer settings on order-based cloud jobs', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const service = new PrinterService({ cloudEnqueueFactory: () => enqueue });
		const profileWithDrawerSettings: PrinterProfile = {
			...cloudProfile,
			vendor: 'epson',
			cloudProvider: 'epson-sdp',
			autoOpenDrawer: true,
			drawerConnector: 'pin5',
		};

		await service.printOrderViaCloud(profileWithDrawerSettings, 1234, '57');

		expect(enqueue).toHaveBeenCalledWith('reg-9', {
			kind: 'order',
			orderId: 1234,
			templateId: '57',
			autoOpenDrawer: true,
			drawerConnector: 'pin5',
		});
	});

	it('rejects printOrderViaCloud for a non-cloud profile', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const service = new PrinterService({ cloudEnqueueFactory: () => enqueue });
		const systemProfile: PrinterProfile = {
			...cloudProfile,
			connectionType: 'system',
		};

		await expect(service.printOrderViaCloud(systemProfile, 1, '2')).rejects.toThrow(
			'Order-based printing requires a cloud printer profile'
		);
	});
});
