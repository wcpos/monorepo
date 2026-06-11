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
	it('annotates the plain-HTTP Epson probe as a local network target', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () => new Response('Method Not Allowed', { status: 405 }));

		await probeVendor('192.168.1.144');

		const epsonCall = fetchMock.mock.calls.find(([input]) => String(input).includes(':8008'));
		expect(epsonCall?.[1]).toMatchObject({ targetAddressSpace: 'local' });
	});

	it('annotates the Star HTTP fallback probe as a local network target', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.startsWith('https://')) throw new Error('TLS failure');
			if (url.includes(':8008')) throw new Error('No Epson endpoint');
			return new Response('Method Not Allowed', { status: 405 });
		});

		await expect(probeVendor('192.168.1.144')).resolves.toBe('star');

		const starHttpCall = fetchMock.mock.calls.find(([input]) =>
			String(input).startsWith('http://192.168.1.144/StarWebPRNT')
		);
		expect(starHttpCall?.[1]).toMatchObject({ targetAddressSpace: 'local' });
	});
});
