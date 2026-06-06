import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkAdapter, resolveStarWebPrntUrl } from '../transport/network-adapter.web';

describe('NetworkAdapter web endpoints', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(
					'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" /></s:Body></s:Envelope>',
					{ status: 200 }
				)
			)
		);
		vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		[8043, 'https://192.168.1.20:8043/cgi-bin/epos/service.cgi'],
		[8008, 'http://192.168.1.20:8008/cgi-bin/epos/service.cgi'],
	] as const)('posts Epson jobs to the resolved port %s endpoint', async (port, endpoint) => {
		const adapter = new NetworkAdapter('192.168.1.20', port, 'epson');

		await adapter.printRaw(new Uint8Array([0x1b, 0x40]));

		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining(endpoint),
			expect.objectContaining({ method: 'POST' })
		);
	});

	it.each([
		['https:', 443, 'https://192.168.1.20:443/StarWebPRNT/SendMessage'],
		['http:', 80, 'http://192.168.1.20:80/StarWebPRNT/SendMessage'],
	] as const)('resolves Star WebPRNT URLs on %s origins', (protocol, port, endpoint) => {
		expect(resolveStarWebPrntUrl('192.168.1.20', port, protocol)).toBe(endpoint);
	});
});
