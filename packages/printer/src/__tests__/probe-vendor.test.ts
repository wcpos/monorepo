import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeVendor } from '../utils/probe-vendor';

describe('probeVendor', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not detect Star when a generic HTTP server returns 404 for WebPRNT', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes(':8008/cgi-bin/epos/service.cgi')) {
				throw new Error('No Epson endpoint');
			}
			return new Response('Not found', { status: 404 });
		});

		await expect(probeVendor('192.168.1.144')).resolves.toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://192.168.1.144/StarWebPRNT/SendMessage',
			expect.objectContaining({ method: 'GET' })
		);
	});

	it('detects Star when WebPRNT exists but rejects GET', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes(':8008/cgi-bin/epos/service.cgi')) {
				throw new Error('No Epson endpoint');
			}
			return new Response('Method Not Allowed', { status: 405 });
		});

		await expect(probeVendor('192.168.1.144')).resolves.toBe('star');
	});
});
