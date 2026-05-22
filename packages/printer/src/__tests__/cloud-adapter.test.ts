import { describe, expect, it, vi } from 'vitest';

import { CloudAdapter } from '../transport/cloud-adapter';

describe('CloudAdapter', () => {
	it('enqueues raw bytes as application/octet-stream for the target cloud printer', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const adapter = new CloudAdapter('printer-123', enqueue);

		await adapter.printRaw(new Uint8Array([0x1b, 0x40, 0x0a]));

		expect(enqueue).toHaveBeenCalledWith('printer-123', {
			data: new Uint8Array([0x1b, 0x40, 0x0a]),
			contentType: 'application/octet-stream',
		});
	});

	it('enqueues HTML as UTF-8 text/html', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const adapter = new CloudAdapter('printer-123', enqueue);

		await adapter.printHtml('<p>hi</p>');

		expect(enqueue).toHaveBeenCalledWith('printer-123', {
			data: new TextEncoder().encode('<p>hi</p>'),
			contentType: 'text/html',
		});
	});

	it('propagates enqueue failures', async () => {
		const enqueue = vi.fn().mockRejectedValue(new Error('queue offline'));
		const adapter = new CloudAdapter('printer-123', enqueue);

		await expect(adapter.printRaw(new Uint8Array([0x01]))).rejects.toThrow('queue offline');
	});
});
