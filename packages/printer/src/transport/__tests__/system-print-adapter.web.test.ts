import { afterEach, describe, expect, it, vi } from 'vitest';

import { SystemPrintAdapter } from '../system-print-adapter.web';

const printFrame = () => document.getElementById('wcpos-print-frame') as HTMLIFrameElement | null;
const sandboxTokens = () => (printFrame()?.getAttribute('sandbox') ?? '').split(/\s+/);

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	printFrame()?.remove();
	localStorage.clear();
});

describe('SystemPrintAdapter (web) print frame', () => {
	// Revert: write the print HTML into a frame without a sandbox, so a fetched page's script
	// runs with the app's origin.
	it("a fetched page's script cannot reach the app origin's storage through print", () => {
		vi.useFakeTimers();
		const page =
			'<p>Receipt</p><script>try{parent.localStorage.setItem("wcpos-print-probe","reached")}catch(e){}' +
			'try{localStorage.setItem("wcpos-print-probe","reached")}catch(e){}</script>';
		void new SystemPrintAdapter().printHtml(page);

		expect(localStorage.getItem('wcpos-print-probe')).toBeNull();
		// The browser holds the line: the frame runs no script, and print() still opens a dialog.
		expect(printFrame()?.hasAttribute('sandbox')).toBe(true);
		expect(sandboxTokens()).not.toContain('allow-scripts');
		expect(sandboxTokens()).toContain('allow-modals');
	});

	it('prints the loaded frame and settles when the dialog closes', async () => {
		vi.useFakeTimers();
		const printing = new SystemPrintAdapter().printHtml('<p>Receipt</p>');
		const frameWindow = printFrame()!.contentWindow!;
		const print = vi.spyOn(frameWindow, 'print').mockImplementation(() => {});

		await vi.advanceTimersByTimeAsync(500);
		expect(print).toHaveBeenCalledTimes(1);

		frameWindow.dispatchEvent(new Event('afterprint'));
		await expect(printing).resolves.toBeUndefined();
	});
});
