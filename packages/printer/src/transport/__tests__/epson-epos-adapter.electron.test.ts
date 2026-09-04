import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPrinterConnectionError } from '../../utils/connection-error';
import { EpsonEposAdapter } from '../epson-epos-adapter.electron';

const response = (success: boolean, code = '') => ({
	status: 200,
	body: `<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="${success}" code="${code}" status="0" />`,
});

describe('Electron EpsonEposAdapter', () => {
	const invoke = vi.fn();

	beforeEach(() => {
		invoke.mockResolvedValue(response(true));
		(window as unknown as Record<string, unknown>).ipcRenderer = { invoke };
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>).ipcRenderer;
		vi.clearAllMocks();
	});

	it('posts a hex-encoded SOAP job over the ePOS IPC channel', async () => {
		await new EpsonEposAdapter('192.168.1.40', 443).printRaw(new Uint8Array([0x1b, 0x40]));

		expect(invoke).toHaveBeenCalledWith('print-epos-http', {
			host: '192.168.1.40',
			port: 443,
			path: '/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000',
			xml: expect.stringContaining('<command>1b40</command>'),
			timeoutMs: 15000,
		});
	});

	it('posts structured markup without a command wrapper', async () => {
		const adapter = new EpsonEposAdapter('192.168.1.40', 443);
		expect(await adapter.supportsMarkup()).toBe(true);
		await adapter.printMarkup({
			template: '<receipt><text>Hello</text></receipt>',
			data: {},
			options: {},
		});

		const request = invoke.mock.calls[0]?.[1];
		expect(request.xml).toContain('<text ');
		expect(request.xml).not.toContain('<command>');
	});

	it('reports a printer rejection as a plain error carrying the ePOS code, not a connection error', async () => {
		invoke.mockResolvedValue(response(false, 'SchemaError'));

		const error = await new EpsonEposAdapter('192.168.1.40', 443)
			.printRaw(new Uint8Array([0x1b]))
			.catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(Error);
		expect(isPrinterConnectionError(error)).toBe(false);
		expect((error as Error).message).toBe('Epson print failed (code: SchemaError)');
	});

	it('reports a transport failure as a structured connection error', async () => {
		invoke.mockRejectedValue(new Error('connect ECONNREFUSED 192.168.1.40:443'));

		const error = await new EpsonEposAdapter('192.168.1.40', 443)
			.printRaw(new Uint8Array([0x1b]))
			.catch((cause: unknown) => cause);

		expect(isPrinterConnectionError(error)).toBe(true);
		expect((error as Error).message).toContain('Could not connect to Epson printer');
	});
});
