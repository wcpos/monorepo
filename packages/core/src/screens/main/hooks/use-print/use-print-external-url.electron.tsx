import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { getLogger } from '@wcpos/utils/logger';

import type { UsePrintExternalURLOptions } from './types';

const printLogger = getLogger(['wcpos', 'print', 'external']);

export const usePrintExternalURL = (options: UsePrintExternalURLOptions) => {
	const { externalURL, html, onBeforePrint, onAfterPrint, onPrintError } = options;
	const [isPrinting, setIsPrinting] = React.useState(false);

	/**
	 *
	 */
	const print = React.useCallback(() => {
		if (!html && !externalURL) {
			printLogger.warn('No HTML or external URL provided to print');
			onPrintError?.('print', new Error('No HTML or external URL provided to print'));
			return;
		}

		if (window && window.ipcRenderer) {
			const printJobId = uuidv4();
			const ipc = window.ipcRenderer as {
				invoke: (channel: string, args: unknown) => Promise<unknown>;
				send: (channel: string, args: unknown) => void;
				once: (channel: string, callback: (...args: unknown[]) => void) => void;
			};

			// When inline HTML is provided, encode as a data URI so the
			// main process can load it without requiring a new IPC channel.
			const urlToSend = html
				? `data:text/html;base64,${btoa(unescape(encodeURIComponent(html)))}`
				: externalURL;

			// Send the print request to the main process
			ipc.send('print-external-url', {
				externalURL: urlToSend,
				printJobId,
			});

			// Listen for onBeforePrint acknowledgment
			ipc.once(`onBeforePrint-${printJobId}`, () => {
				setIsPrinting(true);
				if (onBeforePrint) {
					onBeforePrint();
				}
			});

			// Listen for onAfterPrint
			ipc.once(`onAfterPrint-${printJobId}`, () => {
				setIsPrinting(false);
				if (onAfterPrint) {
					onAfterPrint();
				}
			});

			// Listen for onPrintError
			ipc.once(`onPrintError-${printJobId}`, (_event: unknown, error: unknown) => {
				setIsPrinting(false);
				if (onPrintError) {
					onPrintError('print', error as Error);
				}
			});
		} else {
			printLogger.error('ipcRenderer not available');
		}
	}, [externalURL, html, onBeforePrint, onAfterPrint, onPrintError]);

	return { print, isPrinting };
};
