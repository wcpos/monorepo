import { describe, expect, it, vi } from 'vitest';

import { CloudAdapter, isOrderBasedCloudProfile } from '../transport/cloud-adapter';

import type { PrinterProfile } from '../types';

describe('CloudAdapter', () => {
	it('enqueues raw bytes as application/octet-stream for the target cloud printer', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const adapter = new CloudAdapter('printer-123', enqueue);

		await adapter.printRaw(new Uint8Array([0x1b, 0x40, 0x0a]));

		expect(enqueue).toHaveBeenCalledWith('printer-123', {
			kind: 'raw',
			data: new Uint8Array([0x1b, 0x40, 0x0a]),
			contentType: 'application/octet-stream',
		});
	});

	it('enqueues HTML as UTF-8 text/html', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const adapter = new CloudAdapter('printer-123', enqueue);

		await adapter.printHtml('<p>hi</p>');

		expect(enqueue).toHaveBeenCalledWith('printer-123', {
			kind: 'raw',
			data: new TextEncoder().encode('<p>hi</p>'),
			contentType: 'text/html',
		});
	});

	it('enqueues an order-based job with no payload', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const adapter = new CloudAdapter('printer-123', enqueue);

		await adapter.enqueueOrder(4567, '88');

		expect(enqueue).toHaveBeenCalledWith('printer-123', {
			kind: 'order',
			orderId: 4567,
			templateId: '88',
		});
	});

	it('enqueues an order-based job with drawer settings', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const adapter = new CloudAdapter('printer-123', enqueue);

		await adapter.enqueueOrder(4567, '88', {
			autoOpenDrawer: true,
			drawerConnector: 'pin5',
		});

		expect(enqueue).toHaveBeenCalledWith('printer-123', {
			kind: 'order',
			orderId: 4567,
			templateId: '88',
			autoOpenDrawer: true,
			drawerConnector: 'pin5',
		});
	});

	it('propagates enqueue failures', async () => {
		const enqueue = vi.fn().mockRejectedValue(new Error('queue offline'));
		const adapter = new CloudAdapter('printer-123', enqueue);

		await expect(adapter.printRaw(new Uint8Array([0x01]))).rejects.toThrow('queue offline');
	});
});

describe('isOrderBasedCloudProfile', () => {
	const base: PrinterProfile = {
		id: 'p1',
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
		cloudPrinterId: 'reg-1',
	};

	it('is true for epson-sdp and printnode cloud profiles', () => {
		expect(isOrderBasedCloudProfile({ ...base, cloudProvider: 'epson-sdp' })).toBe(true);
		expect(isOrderBasedCloudProfile({ ...base, cloudProvider: 'printnode' })).toBe(true);
	});

	it('is false for star-cloudprnt, missing provider, and non-cloud profiles', () => {
		expect(isOrderBasedCloudProfile({ ...base, cloudProvider: 'star-cloudprnt' })).toBe(false);
		// Unknown / missing provider falls back to Star (raw upload).
		expect(isOrderBasedCloudProfile(base)).toBe(false);
		expect(
			isOrderBasedCloudProfile({ ...base, connectionType: 'network', address: '1.2.3.4' })
		).toBe(false);
		expect(isOrderBasedCloudProfile(undefined)).toBe(false);
	});
});
