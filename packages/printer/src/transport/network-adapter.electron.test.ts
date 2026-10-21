import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkAdapter } from './network-adapter.electron';
import { printerLogger } from '../logger';

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
		expect(probeEposEndpointMock).toHaveBeenCalledTimes(1);
	});
});

// PrinterService asks supportsMarkup() and then prints in the same job; with four 4 s probes a
// re-probe there doubled a missing ePOS endpoint's wait to ~32 s before raw bytes went out.
describe('Electron NetworkAdapter ePOS probe scope', () => {
	beforeEach(() => {
		eposConstructorMock.mockClear();
		eposPrintRawMock.mockReset().mockResolvedValue(undefined);
		eposPrintMarkupMock.mockReset().mockResolvedValue(undefined);
		ipcPrintRawMock.mockReset().mockResolvedValue(undefined);
		probeEposEndpointMock.mockReset();
	});

	async function receiptJob(adapter: NetworkAdapter, data: Uint8Array) {
		adapter.beginJob();
		if (await adapter.supportsMarkup()) {
			await adapter.printMarkup({ template: '<receipt/>', data: {}, options: {} });
		} else {
			await adapter.printRaw(data);
		}
	}

	it('probes a missing ePOS endpoint once for supportsMarkup() then printRaw() in one job', async () => {
		probeEposEndpointMock.mockResolvedValue(null);
		const infoSpy = vi.spyOn(printerLogger, 'info');
		const adapter = new NetworkAdapter('one-job-miss.test', 9100, 'epson');

		await receiptJob(adapter, new Uint8Array([6]));

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(1);
		expect(ipcPrintRawMock).toHaveBeenCalledTimes(1);
		expect(ipcPrintRawMock).toHaveBeenCalledWith(
			'print-raw-tcp',
			expect.objectContaining({ host: 'one-job-miss.test', port: 9100 }),
			expect.any(String)
		);
		expect(infoSpy).toHaveBeenCalledWith('Reusing this job’s ePOS probe miss', {
			context: { host: 'one-job-miss.test' },
		});
		infoSpy.mockRestore();
	});

	it('probes again on the next job: a miss is never remembered across jobs', async () => {
		probeEposEndpointMock.mockResolvedValue(null);
		const adapter = new NetworkAdapter('next-job-miss.test', 9100, 'epson');

		await receiptJob(adapter, new Uint8Array([7]));
		await receiptJob(adapter, new Uint8Array([8]));

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(2);
		expect(ipcPrintRawMock).toHaveBeenCalledTimes(2);
	});

	it('forgets a miss from a job that never printed when the next job begins', async () => {
		probeEposEndpointMock.mockResolvedValueOnce(null).mockResolvedValueOnce(8008);
		const adapter = new NetworkAdapter('abandoned-job.test', 9100, 'epson');

		// A job that asked, then failed to encode, never reaches printRaw.
		adapter.beginJob();
		expect(await adapter.supportsMarkup()).toBe(false);

		// The printer came back between jobs: the next job must see it, not the old miss.
		await receiptJob(adapter, new Uint8Array([9]));

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(2);
		expect(eposPrintMarkupMock).toHaveBeenCalledTimes(1);
		expect(ipcPrintRawMock).not.toHaveBeenCalled();
	});

	it('keeps a successful probe across jobs', async () => {
		probeEposEndpointMock.mockResolvedValue(8008);
		const adapter = new NetworkAdapter('success-across-jobs.test', 9100, 'epson');

		await receiptJob(adapter, new Uint8Array([10]));
		await receiptJob(adapter, new Uint8Array([11]));
		await receiptJob(
			new NetworkAdapter('success-across-jobs.test', 9100, 'epson'),
			new Uint8Array([12])
		);

		expect(probeEposEndpointMock).toHaveBeenCalledTimes(1);
		expect(eposConstructorMock).toHaveBeenCalledWith('success-across-jobs.test', 8008);
		expect(eposPrintMarkupMock).toHaveBeenCalledTimes(3);
		expect(ipcPrintRawMock).not.toHaveBeenCalled();
	});
});
