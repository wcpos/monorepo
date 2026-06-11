import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeVendor, probeVendorEndpoint } from '../utils/probe-vendor';

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
			String(input).startsWith('http://192.168.1.144:80/StarWebPRNT')
		);
		expect(starHttpCall?.[1]).toMatchObject({ targetAddressSpace: 'local' });
	});
});

describe('probeVendorEndpoint', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('reports the Epson ePOS HTTP endpoint that answered', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes(':8008/cgi-bin/epos/service.cgi')) {
				return new Response('Method Not Allowed', { status: 405 });
			}
			throw new Error('No Star endpoint');
		});

		await expect(probeVendorEndpoint('localhost')).resolves.toEqual({
			vendor: 'epson',
			port: 8008,
			protocol: 'http',
		});
	});

	it('reports Star WebPRNT over HTTPS when port 443 answers', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.startsWith('https://')) return new Response('OK', { status: 200 });
			throw new Error('No HTTP endpoint');
		});

		await expect(probeVendorEndpoint('192.168.1.144')).resolves.toEqual({
			vendor: 'star',
			port: 443,
			protocol: 'https',
		});
	});

	it('falls back to Star WebPRNT over HTTP port 80', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.startsWith('http://192.168.1.144:80/StarWebPRNT')) {
				return new Response('Method Not Allowed', { status: 405 });
			}
			throw new Error('unreachable');
		});

		await expect(probeVendorEndpoint('192.168.1.144')).resolves.toEqual({
			vendor: 'star',
			port: 80,
			protocol: 'http',
		});
	});

	it('finds the dev virtual Star printer on HTTP port 8008', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.startsWith('http://localhost:8008/StarWebPRNT')) {
				return new Response('Method Not Allowed', { status: 405 });
			}
			throw new Error('unreachable');
		});

		await expect(probeVendorEndpoint('localhost')).resolves.toEqual({
			vendor: 'star',
			port: 8008,
			protocol: 'http',
		});
	});
});
