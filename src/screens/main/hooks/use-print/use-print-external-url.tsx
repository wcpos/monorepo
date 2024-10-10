import * as React from 'react';

import type { UsePrintExternalURLOptions } from './types';

function logMessages({
	level = 'error',
	messages,
	suppressErrors = false,
}: {
	level?: 'error' | 'warning' | 'debug';
	messages: unknown[];
	suppressErrors?: boolean;
}) {
	if (!suppressErrors) {
		if (level === 'error') {
			console.error(...messages); // eslint-disable-line no-console
		} else if (level === 'warning') {
			console.warn(...messages); // eslint-disable-line no-console
		} else if (level === 'debug') {
			console.debug(...messages); // eslint-disable-line no-console
		}
	}
}

function removePrintIframe(preserveAfterPrint?: boolean, force?: boolean) {
	if (force || !preserveAfterPrint) {
		const documentPrintWindow = document.getElementById('printWindow');

		if (documentPrintWindow) {
			document.body.removeChild(documentPrintWindow);
		}
	}
}

function generatePrintWindow(): HTMLIFrameElement {
	const printWindow = document.createElement('iframe');
	printWindow.width = `${document.documentElement.clientWidth}px`;
	printWindow.height = `${document.documentElement.clientHeight}px`;
	printWindow.style.position = 'absolute';
	printWindow.style.top = `-${document.documentElement.clientHeight + 100}px`;
	printWindow.style.left = `-${document.documentElement.clientWidth + 100}px`;
	printWindow.id = 'printWindow';

	return printWindow;
}

function startPrint(printWindow: HTMLIFrameElement, options: UsePrintExternalURLOptions) {
	const { onAfterPrint, onPrintError, preserveAfterPrint, suppressErrors } = options;

	setTimeout(() => {
		try {
			if (printWindow.contentWindow) {
				printWindow.contentWindow.focus(); // Needed for IE 11

				try {
					printWindow.contentWindow.print();

					// We cannot reliably detect when the user has completed printing
					// due to cross-origin restrictions, so we call onAfterPrint immediately
					onAfterPrint?.();
					removePrintIframe(preserveAfterPrint);
				} catch (error) {
					// Handle cross-origin errors
					logMessages({
						messages: ['Unable to print the external URL due to cross-origin restrictions.'],
						suppressErrors,
					});
					onPrintError?.('startPrint', error);
				}
			} else {
				logMessages({
					messages: [
						'Cannot access iframe contentWindow. Printing may not be possible due to cross-origin restrictions.',
					],
					suppressErrors,
				});
				onPrintError?.('startPrint', new Error('Cannot access iframe contentWindow'));
			}
		} catch (error) {
			onPrintError?.('startPrint', error);
		}
	}, 500);
}

export function usePrintExternalURL(options: UsePrintExternalURLOptions) {
	const [isPrinting, setIsPrinting] = React.useState(false);
	const promiseResolveRef = React.useRef<(() => void) | null>(null);

	const handlePrint = React.useCallback(() => {
		const {
			externalURL,
			onBeforePrint,
			onAfterPrint,
			onPrintError,
			preserveAfterPrint,
			suppressErrors,
		} = options;

		// Ensure we remove any pre-existing print windows before adding a new one
		removePrintIframe(preserveAfterPrint, true);

		const proceedToPrint = () => {
			if (externalURL) {
				const printWindow = generatePrintWindow();
				printWindow.src = externalURL;

				// Set up onload handler to start printing once the content is loaded
				printWindow.onload = () => {
					try {
						startPrint(printWindow, {
							...options,
							onAfterPrint: () => {
								// Reset the Promise resolve so we can print again
								promiseResolveRef.current = null;
								setIsPrinting(false);
								onAfterPrint?.();
							},
						});
					} catch (error) {
						onPrintError?.('startPrint', error as Error);
					}
				};

				document.body.appendChild(printWindow);
			} else {
				logMessages({
					messages: ['No external URL provided to print'],
					suppressErrors,
				});
			}
		};

		const onBeforePrintWrapper = () => {
			return new Promise<void>((resolve) => {
				promiseResolveRef.current = resolve;
				setIsPrinting(true);
				// Call the user's onBeforePrint if provided
				const result = onBeforePrint?.();
				if (result instanceof Promise) {
					result.then(resolve).catch((error) => {
						onPrintError?.('onBeforePrint', error);
						resolve();
					});
				} else {
					resolve();
				}
			});
		};

		onBeforePrintWrapper()
			.then(() => proceedToPrint())
			.catch((error: Error) => {
				onPrintError?.('onBeforePrint', error);
			});
	}, [options]);

	React.useEffect(() => {
		if (isPrinting && promiseResolveRef.current) {
			promiseResolveRef.current();
		}
	}, [isPrinting]);

	return { print: handlePrint, isPrinting };
}
