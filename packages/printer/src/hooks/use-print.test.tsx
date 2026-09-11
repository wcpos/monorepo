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
	let firstJob!: Promise<void>;
	let secondJob!: Promise<void>;
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
	let job!: Promise<void>;
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
