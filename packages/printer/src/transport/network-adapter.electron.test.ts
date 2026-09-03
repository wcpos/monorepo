import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkAdapter } from './network-adapter.electron';

const { eposConstructorMock, eposPrintRawMock, ipcPrintRawMock, probeEposEndpointMock } =
	vi.hoisted(() => ({
		eposConstructorMock: vi.fn(),
		eposPrintRawMock: vi.fn(),
		ipcPrintRawMock: vi.fn(),
		probeEposEndpointMock: vi.fn(),
	}));

vi.mock('./epson-epos-adapter.electron', () => ({
	EpsonEposAdapter: class {
		constructor(host: string, port: number) {
			eposConstructorMock(host, port);
		}

		printRaw = eposPrintRawMock;
	},
	postEposHttp: vi.fn(),
}));

vi.mock('./epos-endpoint', async (importOriginal) => ({
	...(await importOriginal<typeof import('./epos-endpoint')>()),
	probeEposEndpoint: probeEposEndpointMock,
}));

vi.mock('./ipc-print.electron', () => ({
	ipcPrintRaw: ipcPrintRawMock,
	PRINT_TIMEOUT_MS: 15_000,
}));

describe('Electron NetworkAdapter ePOS routing', () => {
	beforeEach(() => {
		eposConstructorMock.mockClear();
		eposPrintRawMock.mockReset().mockResolvedValue(undefined);
		ipcPrintRawMock.mockReset().mockResolvedValue(undefined);
		probeEposEndpointMock.mockReset();
	});

	it('uses a saved ePOS port directly', async () => {
		await new NetworkAdapter('direct-port.test', 443, 'epson').printRaw(new Uint8Array([1]));

		expect(eposConstructorMock).toHaveBeenCalledWith('direct-port.test', 443);
		expect(probeEposEndpointMock).not.toHaveBeenCalled();
		expect(ipcPrintRawMock).not.toHaveBeenCalled();
	});

	it('propagates a saved ePOS port print failure without raw fallback', async () => {
		const error = new Error('ePOS unavailable');
		eposPrintRawMock.mockRejectedValueOnce(error);

		await expect(
			new NetworkAdapter('direct-failure.test', 443, 'epson').printRaw(new Uint8Array([2]))
		).rejects.toBe(error);
		expect(ipcPrintRawMock).not.toHaveBeenCalled();
	});

	it('does not cache a failed probe', async () => {
		probeEposEndpointMock.mockResolvedValue(null);
		const data = new Uint8Array([3]);

		await new NetworkAdapter('failed-probe.test', 9100, 'epson').printRaw(data);
		await new NetworkAdapter('failed-probe.test', 9100, 'epson').printRaw(data);

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(2);
		expect(ipcPrintRawMock).toHaveBeenCalledTimes(2);
		expect(ipcPrintRawMock).toHaveBeenCalledWith(
			'print-raw-tcp',
			expect.objectContaining({ host: 'failed-probe.test', port: 9100 }),
			expect.any(String)
		);
	});

	it('caches and reuses a successful probe', async () => {
		probeEposEndpointMock.mockResolvedValue(8008);

		await new NetworkAdapter('successful-probe.test', 9100, 'epson').printRaw(new Uint8Array([4]));
		await new NetworkAdapter('successful-probe.test', 9100, 'epson').printRaw(new Uint8Array([5]));

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(1);
		expect(eposConstructorMock).toHaveBeenCalledTimes(2);
		expect(eposConstructorMock).toHaveBeenCalledWith('successful-probe.test', 8008);
		expect(ipcPrintRawMock).not.toHaveBeenCalled();
	});
});
