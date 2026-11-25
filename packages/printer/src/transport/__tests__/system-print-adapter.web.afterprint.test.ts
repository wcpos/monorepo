import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemPrintAdapter } from '../system-print-adapter.web';

describe('SystemPrintAdapter afterprint', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		document.getElementById('wcpos-print-frame')?.remove();
	});

	// Revert: remove the host window's afterprint listener.
	it('a dialog that reports its close on the host window settles the job at once', async () => {
		let resolved = false;
		const job = new SystemPrintAdapter().printHtml('<p>Receipt</p>').then(() => {
			resolved = true;
		});
		const iframe = document.getElementById('wcpos-print-frame') as HTMLIFrameElement;
		const win = iframe.contentWindow!;
		vi.spyOn(win, 'focus').mockImplementation(() => {});
		const print = vi.spyOn(win, 'print').mockImplementation(() => {});

		await vi.advanceTimersByTimeAsync(500);
		expect(print).toHaveBeenCalledTimes(1);
		expect(resolved).toBe(false);
		window.dispatchEvent(new Event('afterprint'));
		await vi.advanceTimersByTimeAsync(10);

		expect(resolved).toBe(true);
		await job;
	});

	// Revert: remove the print frame's afterprint listener.
	it("the frame's own afterprint still settles the job", async () => {
		let resolved = false;
		const job = new SystemPrintAdapter().printHtml('<p>Receipt</p>').then(() => {
			resolved = true;
		});
		const iframe = document.getElementById('wcpos-print-frame') as HTMLIFrameElement;
		const win = iframe.contentWindow!;
		vi.spyOn(win, 'focus').mockImplementation(() => {});
		const print = vi.spyOn(win, 'print').mockImplementation(() => {});

		await vi.advanceTimersByTimeAsync(500);
		expect(print).toHaveBeenCalledTimes(1);
		expect(resolved).toBe(false);
		win.dispatchEvent(new Event('afterprint'));
		await vi.advanceTimersByTimeAsync(10);

		expect(resolved).toBe(true);
		await job;
	});

	// Revert: leave the host window's afterprint listener attached during cleanup.
	it('a settled job leaves no listener on the host window', async () => {
		const addListener = vi.spyOn(window, 'addEventListener');
		const removeListener = vi.spyOn(window, 'removeEventListener');
		const job = new SystemPrintAdapter().printHtml('<p>Receipt</p>');
		const iframe = document.getElementById('wcpos-print-frame') as HTMLIFrameElement;
		const win = iframe.contentWindow!;
		vi.spyOn(win, 'focus').mockImplementation(() => {});
		const print = vi.spyOn(win, 'print').mockImplementation(() => {});

		await vi.advanceTimersByTimeAsync(500);
		expect(print).toHaveBeenCalledTimes(1);
		win.dispatchEvent(new Event('afterprint'));
		await vi.advanceTimersByTimeAsync(10);
		await job;

		expect(addListener).toHaveBeenCalledWith('afterprint', expect.any(Function), { once: true });
		const listener = addListener.mock.calls.find(([type]) => type === 'afterprint')![1];
		expect(removeListener).toHaveBeenCalledWith('afterprint', listener);
	});
});
