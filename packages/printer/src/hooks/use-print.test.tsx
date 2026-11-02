import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { usePrint } from './use-print';

const { printHtml } = vi.hoisted(() => ({ printHtml: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../transport/system-print-adapter', () => ({
	SystemPrintAdapter: class {
		name = 'system';
		printHtml = printHtml;
	},
}));
vi.mock('../raster/rasterize-provider', () => ({ useOptionalRasterize: () => null }));
afterEach(() => vi.clearAllMocks());

it('prepares and dispatches overlapping prints in call order, not response order', async () => {
	let releaseFirst!: () => void;
	const firstResponse = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	let count = 0;
	const preparePrint = vi.fn(async () => {
		const receiptPrintCount = ++count;
		if (receiptPrintCount === 1) await firstResponse;
		return { html: `<p data-count="${receiptPrintCount}">Receipt</p>` };
	});
	const first = renderHook(() => usePrint({ preparePrint }));
	const second = renderHook(() => usePrint({ preparePrint }));
	let firstJob!: Promise<boolean>;
	let secondJob!: Promise<boolean>;
	await act(async () => {
		firstJob = first.result.current.print();
		secondJob = second.result.current.print();
	});
	const preparationsWhileFirstPending = preparePrint.mock.calls.length;
	await act(async () => {
		releaseFirst();
		await Promise.all([firstJob, secondJob]);
	});

	expect(preparationsWhileFirstPending).toBe(1);
	expect(printHtml).toHaveBeenCalledTimes(2);
	expect(printHtml.mock.calls[0][0]).toContain('data-count="1"');
	expect(printHtml.mock.calls[1][0]).toContain('data-count="2"');
});

it('continues queued printing after preparation fails', async () => {
	const error = new Error('Receipt fetch failed');
	const onPrintError = vi.fn();
	const preparePrint = vi
		.fn()
		.mockRejectedValueOnce(error)
		.mockResolvedValueOnce({ html: '<p>Next receipt</p>' });
	const { result } = renderHook(() => usePrint({ preparePrint, onPrintError }));
	await act(async () => {
		const first = result.current.print();
		const second = result.current.print();
		await expect(first).rejects.toBe(error);
		await second;
	});
	expect(onPrintError).toHaveBeenCalledWith(error);
	expect(printHtml).toHaveBeenCalledTimes(1);
	expect(printHtml.mock.calls[0][0]).toContain('Next receipt');
	expect(result.current.isPrinting).toBe(false);
});

it('does not commit the local count when dispatch throws', async () => {
	const error = new Error('Printer disconnected');
	const commit = vi.fn().mockResolvedValue(undefined);
	printHtml.mockRejectedValueOnce(error);
	const { result } = renderHook(() =>
		usePrint({ preparePrint: async () => ({ html: '<p>Receipt</p>', commit }) })
	);
	await act(async () => {
		await expect(result.current.print()).rejects.toBe(error);
	});
	expect(printHtml).toHaveBeenCalledTimes(1);
	expect(commit).not.toHaveBeenCalled();
});

it('awaits successful dispatch before committing the local count once', async () => {
	let finishDispatch!: () => void;
	const dispatched = new Promise<void>((resolve) => {
		finishDispatch = resolve;
	});
	printHtml.mockReturnValueOnce(dispatched);
	const commit = vi.fn().mockResolvedValue(undefined);
	const { result } = renderHook(() =>
		usePrint({ preparePrint: async () => ({ html: '<p>Receipt</p>', commit }) })
	);
	let job!: Promise<boolean>;
	await act(async () => {
		job = result.current.print();
	});
	expect(printHtml).toHaveBeenCalledTimes(1);
	expect(commit).not.toHaveBeenCalled();
	await act(async () => {
		finishDispatch();
		await job;
	});
	expect(commit).toHaveBeenCalledTimes(1);
});

it('returns an explicit success signal only after dispatch', async () => {
	const { result } = renderHook(() => usePrint({ html: '<p>Report</p>' }));
	await act(async () => {
		await expect(result.current.print()).resolves.toBe(true);
	});
});

it('does not report success when there is no printable content', async () => {
	const { result } = renderHook(() => usePrint({}));
	await act(async () => {
		await expect(result.current.print()).rejects.toThrow('No printable content');
	});
	expect(printHtml).not.toHaveBeenCalled();
});

// ADR 0040 Decided 1 rule 1: the ESC/POS fallback (no thermal template) prints the line too.
it('hands the awaiting-store line to the built-in layout and marks a thermal template', async () => {
	const { PrinterService } = await import('../printer-service');
	const printReceipt = vi.spyOn(PrinterService.prototype, 'printReceipt').mockResolvedValue();
	const printThermal = vi
		.spyOn(PrinterService.prototype, 'printThermalTemplateForPrint')
		.mockResolvedValue();
	const profile = { id: 'p', connectionType: 'network', columns: 48 } as never;
	const options = { receiptData: {}, printerProfile: profile, awaitingStoreLine: 'Awaiting store' };
	const fallback = renderHook(() => usePrint(options));
	await act(async () => {
		await fallback.result.current.print();
	});
	expect(printReceipt.mock.calls[0][4]).toBe('Awaiting store');
	const thermal = renderHook(() =>
		usePrint({
			...options,
			templateEngine: 'thermal',
			templateXml: '<receipt><text>R</text></receipt>',
		})
	);
	await act(async () => {
		await thermal.result.current.print();
	});
	expect(printThermal.mock.calls[0][2]).toContain(
		'<receipt><align mode="center"><bold><text>Awaiting store'
	);
});
