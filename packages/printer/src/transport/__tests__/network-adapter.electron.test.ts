import { afterEach, describe, expect, it, vi } from 'vitest';

import { NetworkAdapter } from '../network-adapter.electron';

describe('Electron NetworkAdapter', () => {
	afterEach(() => {
		delete (window as unknown as Record<string, unknown>).ipcRenderer;
	});

	it('falls back to raw TCP when every Epson ePOS endpoint probe fails', async () => {
		const invoke = vi.fn(async (channel: string) => {
			if (channel === 'print-epos-http') {
				return { status: 404, body: '<html>Not found</html>' };
			}
			return undefined;
		});
		(window as unknown as Record<string, unknown>).ipcRenderer = { invoke };

		const adapter = new NetworkAdapter('192.168.1.33', 9100, 'epson');
		await adapter.printRaw(new Uint8Array([0x1b, 0x40]));

		expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
			'print-epos-http',
			'print-epos-http',
			'print-epos-http',
			'print-epos-http',
			'print-raw-tcp',
		]);
		expect(invoke).toHaveBeenLastCalledWith('print-raw-tcp', {
			host: '192.168.1.33',
			port: 9100,
			data: new Uint8Array([0x1b, 0x40]),
		});
	});

	it('memoizes a successful probe and delegates Epson jobs to ePOS HTTP', async () => {
		const successBody =
			'<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="0" />';
		const invoke = vi.fn(async (_channel: string, _args?: unknown) => ({
			status: 200,
			body: successBody,
		}));
		(window as unknown as Record<string, unknown>).ipcRenderer = { invoke };

		const adapter = new NetworkAdapter('192.168.1.34', 9100, 'epson');
		await adapter.printRaw(new Uint8Array([0x1b, 0x40]));
		await adapter.printRaw(new Uint8Array([0x0a]));

		expect(invoke).toHaveBeenCalledTimes(3);
		expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
			'print-epos-http',
			'print-epos-http',
			'print-epos-http',
		]);
		expect(invoke.mock.calls[2][1]).toMatchObject({
			host: '192.168.1.34',
			port: 443,
			xml: expect.stringContaining('<command>0a</command>'),
		});
	});
});
