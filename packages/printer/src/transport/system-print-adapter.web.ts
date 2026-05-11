import type { PrinterTransport } from '../types';

const IMAGE_WAIT_TIMEOUT_MS = 5_000;

export function waitForPrintDocumentImages(
	doc: Document,
	timeoutMs = IMAGE_WAIT_TIMEOUT_MS
): Promise<void> {
	const pendingImages = Array.from(doc.images).filter((image) => !image.complete);
	if (pendingImages.length === 0) return Promise.resolve();

	const imagesReady = Promise.all(
		pendingImages.map(
			(image) =>
				new Promise<void>((resolve) => {
					image.addEventListener('load', () => resolve(), { once: true });
					image.addEventListener('error', () => resolve(), { once: true });
				})
		)
	).then(() => undefined);
	let timeoutId: ReturnType<typeof setTimeout>;
	const timeout = new Promise<void>((resolve) => {
		timeoutId = setTimeout(resolve, timeoutMs);
	});

	return Promise.race([imagesReady, timeout]).finally(() => {
		clearTimeout(timeoutId);
	});
}

/**
 * Web system print adapter.
 * Creates a hidden iframe, loads HTML, calls window.print().
 */
export class SystemPrintAdapter implements PrinterTransport {
	readonly name = 'system-print-web';

	async printRaw(_data: Uint8Array): Promise<void> {
		throw new Error(
			'SystemPrintAdapter does not support raw byte printing. Use printHtml instead.'
		);
	}

	async printHtml(html: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// Remove any existing print iframe
			const existing = document.getElementById('wcpos-print-frame');
			if (existing) {
				document.body.removeChild(existing);
			}

			const iframe = document.createElement('iframe');
			iframe.id = 'wcpos-print-frame';
			iframe.style.position = 'absolute';
			iframe.style.top = '-10000px';
			iframe.style.left = '-10000px';
			iframe.style.width = '0';
			iframe.style.height = '0';
			document.body.appendChild(iframe);

			const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
			if (!doc) {
				document.body.removeChild(iframe);
				reject(new Error('Cannot access iframe document'));
				return;
			}

			doc.open();
			doc.write(html);
			doc.close();

			// Wait for content to render before printing
			setTimeout(() => {
				void waitForPrintDocumentImages(doc).then(() => {
					const win = iframe.contentWindow;
					if (!win) {
						document.body.removeChild(iframe);
						reject(new Error('Cannot access iframe window'));
						return;
					}

					// Use afterprint to detect when the print dialog closes so the
					// print queue waits for the actual operation to finish.
					const FALLBACK_TIMEOUT = 60_000;
					let settled = false;
					let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

					const cleanup = () => {
						if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
						win.removeEventListener('afterprint', settle);
						// Defer iframe removal so the browser finishes spooling.
						// Use the captured iframe ref — not getElementById — to avoid
						// removing a newer iframe created by a subsequent print job.
						setTimeout(() => {
							if (iframe.isConnected) {
								iframe.remove();
							}
						}, 1000);
					};

					const settle = () => {
						if (settled) return;
						settled = true;
						cleanup();
						resolve();
					};

					try {
						fallbackTimer = setTimeout(settle, FALLBACK_TIMEOUT);
						win.addEventListener('afterprint', settle, { once: true });

						win.focus();
						win.print();
					} catch (error) {
						if (!settled) {
							settled = true;
							cleanup();
							reject(error);
						}
					}
				});
			}, 500);
		});
	}

	async disconnect(): Promise<void> {
		// Nothing to clean up for system print
	}
}
