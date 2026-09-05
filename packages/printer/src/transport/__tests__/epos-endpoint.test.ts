import { describe, expect, it, vi } from 'vitest';

import { probeEposEndpoint } from '../epos-endpoint';

const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('../../logger', () => ({ printerLogger: { debug: vi.fn(), info } }));

const SOCKET_IO_BODY = 'Welcome to socket.io.';

const SUCCESS_BODY =
	'<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="251658262" />';
const SCHEMA_ERROR_BODY =
	'<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="false" code="SchemaError" status="0" />';

describe('probeEposEndpoint', () => {
	it('selects port 443 for the Epson m30III endpoint profile', async () => {
		const post = vi.fn(async (port: number) => {
			switch (port) {
				case 443:
					return { status: 200, body: SUCCESS_BODY };
				case 8043:
					return { status: 200, body: '0{"sid":"socket.io"}' };
				case 80:
					return { status: 404, body: '<html>Not found</html>' };
				default:
					throw new Error('connection refused');
			}
		});

		await expect(probeEposEndpoint('192.168.1.30', post)).resolves.toBe(443);
		expect(post).toHaveBeenCalledTimes(1);
		expect(post).toHaveBeenCalledWith(
			443,
			'/cgi-bin/epos/service.cgi?devid=local_printer&timeout=4000',
			expect.stringContaining('<epos-print'),
			4000
		);
		expect(info).toHaveBeenCalledWith('ePOS port selected', expect.any(Object));
	});

	it('accepts SchemaError as proof that the ePOS CGI exists', async () => {
		const post = vi.fn(async () => ({ status: 200, body: SCHEMA_ERROR_BODY }));

		await expect(probeEposEndpoint('192.168.1.31', post)).resolves.toBe(443);
	});

	it('returns null after transport, HTTP, and non-ePOS responses all fail', async () => {
		const post = vi.fn(async (port: number) => {
			if (port === 443) throw new Error('certificate rejected');
			if (port === 8043) return { status: 200, body: 'socket.io banner' };
			if (port === 80) return { status: 404, body: '<html>Not found</html>' };
			return { status: 503, body: SUCCESS_BODY };
		});

		await expect(probeEposEndpoint('192.168.1.32', post)).resolves.toBeNull();
		expect(post.mock.calls.map(([port]) => port)).toEqual([443, 8043, 80, 8008]);
	});
	it('says why it rejected an ePOS-Device endpoint that answered 200', async () => {
		info.mockClear();
		const post = vi.fn(async (port: number) => {
			if (port === 8043) return { status: 200, body: SOCKET_IO_BODY };
			throw new Error('connection refused');
		});

		await expect(probeEposEndpoint('192.168.1.33', post)).resolves.toBeNull();
		expect(info).toHaveBeenCalledWith('ePOS endpoint rejected', {
			context: {
				host: '192.168.1.33',
				port: 8043,
				reason: 'Unexpected Epson ePOS response from printer',
				elapsedMs: expect.any(Number),
			},
		});
	});

	it('keeps looking at the remaining ports after a rejection', async () => {
		const post = vi.fn(async (port: number) => {
			if (port === 8043) return { status: 200, body: SOCKET_IO_BODY };
			if (port === 8008) return { status: 200, body: SUCCESS_BODY };
			throw new Error('connection refused');
		});

		await expect(probeEposEndpoint('192.168.1.34', post)).resolves.toBe(8008);
	});
});
