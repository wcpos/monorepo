import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkAdapter } from './network-adapter.electron';

const {
	eposConstructorMock,
	eposPrintMarkupMock,
	eposPrintRawMock,
	ipcPrintRawMock,
	probeEposEndpointMock,
} = vi.hoisted(() => ({
	eposConstructorMock: vi.fn(),
	eposPrintMarkupMock: vi.fn(),
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
		printMarkup = eposPrintMarkupMock;
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
		eposPrintMarkupMock.mockReset().mockResolvedValue(undefined);
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
		const adapter = new NetworkAdapter('failed-probe.test', 9100, 'epson');

		await adapter.printRaw(data);
		await adapter.printRaw(data);

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

	it('reports markup support and forwards without probing twice on an ePOS lane', async () => {
		probeEposEndpointMock.mockResolvedValue(8008);
		const adapter = new NetworkAdapter('markup-probe.test', 9100, 'epson');
		const job = { template: '<receipt/>', data: {}, options: {} };

		expect(await adapter.supportsMarkup()).toBe(true);
		await adapter.printMarkup(job);

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(1);
		expect(eposPrintMarkupMock).toHaveBeenCalledWith(job);
		expect(ipcPrintRawMock).not.toHaveBeenCalled();
	});

	it('rejects markup when an Epson profile resolves to raw TCP', async () => {
		probeEposEndpointMock.mockResolvedValue(null);
		const adapter = new NetworkAdapter('raw-only.test', 9100, 'epson');

		expect(await adapter.supportsMarkup()).toBe(false);
		await expect(
			adapter.printMarkup({ template: '<receipt/>', data: {}, options: {} })
		).rejects.toThrow('markup printing is not available on this transport');
	});
});
