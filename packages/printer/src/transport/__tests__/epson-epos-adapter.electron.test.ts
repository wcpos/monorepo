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

	it('includes the ePOS code in a structured connection error', async () => {
		invoke.mockResolvedValue(response(false, 'SchemaError'));

		const error = await new EpsonEposAdapter('192.168.1.40', 443)
			.printRaw(new Uint8Array([0x1b]))
			.catch((cause: unknown) => cause);

		expect(isPrinterConnectionError(error)).toBe(true);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain('SchemaError');
	});
});
