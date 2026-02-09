import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { getLogger } from '@wcpos/utils/logger';

import type { UsePrintExternalURLOptions } from './types';

const printLogger = getLogger(['wcpos', 'print', 'external']);

export const usePrintExternalURL = (options: UsePrintExternalURLOptions) => {
	const { externalURL, onBeforePrint, onAfterPrint, onPrintError } = options;
	const [isPrinting, setIsPrinting] = React.useState(false);

	/**
	 *
	 */
	const print = React.useCallback(() => {
		if (window && window.ipcRenderer) {
			const printJobId = uuidv4();
			const ipc = window.ipcRenderer as {
				invoke: (channel: string, args: unknown) => Promise<unknown>;
				send: (channel: string, args: unknown) => void;
				once: (channel: string, callback: (...args: unknown[]) => void) => void;
			};

			// Send the print request to the main process
			ipc.send('print-external-url', {
				externalURL,
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
	}, [externalURL, onBeforePrint, onAfterPrint, onPrintError]);

	return { print, isPrinting };
};
