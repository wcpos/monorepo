import { afterEach, describe, expect, it, vi } from 'vitest';

import { SystemPrintAdapter } from '../system-print-adapter.web';

const SANDBOX = 'allow-same-origin allow-modals';
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

	// Revert: add allow-scripts to the sandbox, or write the HTML into the frame's document.
	it('the frame enters the document with exactly its sandbox and its HTML only through srcdoc', () => {
		vi.useFakeTimers();
		const html = '<p>Receipt</p>';
		const inserted: { sandbox: string | null; srcdoc: string | null }[] = [];
		const documentWrites: unknown[] = [];
		const append = Node.prototype.appendChild;
		vi.spyOn(document.body, 'appendChild').mockImplementation(((node: Node) => {
			const added = append.call(document.body, node);
			if (node instanceof HTMLIFrameElement) {
				inserted.push({
					sandbox: node.getAttribute('sandbox'),
					srcdoc: node.getAttribute('srcdoc'),
				});
				const doc = node.contentDocument;
				if (doc) {
					for (const method of ['open', 'write', 'writeln'] as const) {
						const original = doc[method].bind(doc) as unknown as (...args: unknown[]) => unknown;
						doc[method] = ((...args: unknown[]) => {
							documentWrites.push(method);
							return original(...args);
						}) as never;
					}
				}
			}
			return added;
		}) as never);

		void new SystemPrintAdapter().printHtml(html);

		expect(inserted).toEqual([{ sandbox: SANDBOX, srcdoc: html }]);
		expect(documentWrites).toEqual([]);
	});

	// Revert: write the frame's sandbox (or its HTML) at any step after it is created.
	it('no later step writes the sandbox or the HTML: print, dialog close, a second job', async () => {
		vi.useFakeTimers();
		const changes: (string | null)[] = [];
		const observer = new MutationObserver((records) =>
			changes.push(...records.map((record) => record.attributeName))
		);
		observer.observe(document.body, {
			subtree: true,
			attributes: true,
			attributeFilter: ['sandbox', 'srcdoc', 'src'],
		});
		const adapter = new SystemPrintAdapter();

		const first = adapter.printHtml('<p>One</p>');
		const frame = printFrame()!;
		const print = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
		await vi.advanceTimersByTimeAsync(500);
		expect(print).toHaveBeenCalledTimes(1);
		frame.contentWindow!.dispatchEvent(new Event('afterprint'));
		await first;

		// The next job starts while the first frame waits out its removal, and replaces it.
		const second = adapter.printHtml('<p>Two</p>');
		const next = printFrame()!;
		expect(next).not.toBe(frame);
		expect(frame.isConnected).toBe(false);
		vi.spyOn(next.contentWindow!, 'print').mockImplementation(() => {});
		await vi.advanceTimersByTimeAsync(500);
		next.contentWindow!.dispatchEvent(new Event('afterprint'));
		await second;
		await vi.advanceTimersByTimeAsync(1000);
		expect(next.isConnected).toBe(false);

		changes.push(...observer.takeRecords().map((record) => record.attributeName));
		observer.disconnect();
		expect(changes).toEqual([]);
		expect(frame.getAttribute('sandbox')).toBe(SANDBOX);
		expect(next.getAttribute('sandbox')).toBe(SANDBOX);
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

	// Revert: wait for the frame's load event with no bound before printing.
	it('a frame whose load never fires still prints once the wait bound passes', async () => {
		vi.useFakeTimers();
		const addListener = HTMLIFrameElement.prototype.addEventListener;
		vi.spyOn(HTMLIFrameElement.prototype, 'addEventListener').mockImplementation(function (
			this: HTMLIFrameElement,
			...args: Parameters<HTMLIFrameElement['addEventListener']>
		) {
			if (args[0] === 'load') return;
			return addListener.apply(this, args);
		});
		const printing = new SystemPrintAdapter().printHtml('<p>Receipt</p>');
		const frameWindow = printFrame()!.contentWindow!;
		const print = vi.spyOn(frameWindow, 'print').mockImplementation(() => {});

		await vi.advanceTimersByTimeAsync(500);
		expect(print).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5_001);
		expect(print).toHaveBeenCalledTimes(1);

		frameWindow.dispatchEvent(new Event('afterprint'));
		await expect(printing).resolves.toBeUndefined();
	});
});
