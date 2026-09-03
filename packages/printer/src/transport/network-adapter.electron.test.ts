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
		ipcPrintRawMock.mockReset().mockImplementation(async (channel: string) => {
			if (channel === 'print-raw-tls') throw new Error("No handler registered for 'print-raw-tls'");
		});
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

	it('uses a saved raw TLS port directly', async () => {
		ipcPrintRawMock.mockResolvedValueOnce(undefined);
		const data = new Uint8Array([6]);

		await new NetworkAdapter('tls-port.test', 9143, 'epson').printRaw(data);

		expect(ipcPrintRawMock).toHaveBeenCalledWith(
			'print-raw-tls',
			{ host: 'tls-port.test', port: 9143, data },
			expect.any(String)
		);
		expect(probeEposEndpointMock).not.toHaveBeenCalled();
		expect(ipcPrintRawMock).not.toHaveBeenCalledWith(
			'print-raw-tcp',
			expect.anything(),
			expect.any(String)
		);
	});

	it('surfaces a saved raw TLS port failure without fallback', async () => {
		const error = new Error('TLS unavailable');
		ipcPrintRawMock.mockRejectedValueOnce(error);

		await expect(
			new NetworkAdapter('tls-failure.test', 9143, 'epson').printRaw(new Uint8Array([7]))
		).rejects.toBe(error);
		expect(probeEposEndpointMock).not.toHaveBeenCalled();
		expect(ipcPrintRawMock).not.toHaveBeenCalledWith(
			'print-raw-tcp',
			expect.anything(),
			expect.any(String)
		);
	});

	it('does not cache a failed probe', async () => {
		probeEposEndpointMock.mockResolvedValue(null);
		const data = new Uint8Array([3]);

		await new NetworkAdapter('failed-probe.test', 9100, 'epson').printRaw(data);
		await new NetworkAdapter('failed-probe.test', 9100, 'epson').printRaw(data);

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(2);
		expect(ipcPrintRawMock).toHaveBeenCalledTimes(4);
		expect(ipcPrintRawMock.mock.calls.map(([channel]) => channel)).toEqual([
			'print-raw-tls',
			'print-raw-tcp',
			'print-raw-tls',
			'print-raw-tcp',
		]);
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
		expect(ipcPrintRawMock.mock.calls.map(([channel]) => channel)).toEqual([
			'print-raw-tls',
			'print-raw-tls',
		]);
	});

	it('probes 9143 with zero bytes, then prints over TLS and caches the host', async () => {
		ipcPrintRawMock.mockResolvedValue(undefined);

		await new NetworkAdapter('tls-cache.test', 9100, 'epson').printRaw(new Uint8Array([8]));
		await new NetworkAdapter('tls-cache.test', 9100, 'epson').printRaw(new Uint8Array([9]));

		expect(ipcPrintRawMock.mock.calls.map(([channel]) => channel)).toEqual([
			'print-raw-tls',
			'print-raw-tls',
			'print-raw-tls',
		]);
		expect(
			ipcPrintRawMock.mock.calls.map(([, args]) => (args as { data: Uint8Array }).data.length)
		).toEqual([0, 1, 1]);
		expect(probeEposEndpointMock).not.toHaveBeenCalled();
	});

	it('never sends the job over TLS when the probe fails', async () => {
		probeEposEndpointMock.mockResolvedValue(null);

		await new NetworkAdapter('tls-refused.test', 9100, 'epson').printRaw(new Uint8Array([11]));

		const tlsCalls = ipcPrintRawMock.mock.calls.filter(([channel]) => channel === 'print-raw-tls');
		expect(tlsCalls).toHaveLength(1);
		expect((tlsCalls[0][1] as { data: Uint8Array }).data).toHaveLength(0);
		expect(ipcPrintRawMock).toHaveBeenCalledWith(
			'print-raw-tcp',
			expect.objectContaining({ host: 'tls-refused.test', port: 9100 }),
			expect.any(String)
		);
	});

	it('abandons a hung 9143 probe after two seconds without ever sending the job over TLS', async () => {
		vi.useFakeTimers();
		ipcPrintRawMock.mockImplementation((channel: string) => {
			if (channel === 'print-raw-tls') return new Promise<void>(() => undefined);
			return Promise.resolve();
		});
		probeEposEndpointMock.mockResolvedValue(null);
		const result = new NetworkAdapter('tls-timeout.test', 9100, 'epson').printRaw(
			new Uint8Array([10])
		);

		await vi.advanceTimersByTimeAsync(1_999);
		expect(probeEposEndpointMock).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await result;

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(1);
		expect(ipcPrintRawMock.mock.calls.map(([channel]) => channel)).toEqual([
			'print-raw-tls',
			'print-raw-tcp',
		]);
		// The hung call was the zero-byte probe; the job bytes went only to raw TCP.
		expect((ipcPrintRawMock.mock.calls[0][1] as { data: Uint8Array }).data).toHaveLength(0);
		vi.useRealTimers();
	});
});
