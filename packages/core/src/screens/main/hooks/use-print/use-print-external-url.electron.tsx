import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import type { UseReactToPrintOptions } from './types';

interface UsePrintExternalURLOptions extends UseReactToPrintOptions {
	externalURL: string;
}

export const usePrintExternalURL = (options: UsePrintExternalURLOptions) => {
	const { externalURL, onBeforePrint, onAfterPrint, onPrintError } = options;
	const [isPrinting, setIsPrinting] = React.useState(false);

	/**
	 *
	 */
	const print = React.useCallback(() => {
		if (window && window.ipcRenderer) {
			const printJobId = uuidv4();

			// Send the print request to the main process
			window.ipcRenderer.send('print-external-url', {
				externalURL,
				printJobId,
			});

			// Listen for onBeforePrint acknowledgment
			window.ipcRenderer.once(`onBeforePrint-${printJobId}`, () => {
				setIsPrinting(true);
				if (onBeforePrint) {
					onBeforePrint();
				}
			});

			// Listen for onAfterPrint
			window.ipcRenderer.once(`onAfterPrint-${printJobId}`, () => {
				setIsPrinting(false);
				if (onAfterPrint) {
					onAfterPrint();
				}
			});

			// Listen for onPrintError
			window.ipcRenderer.once(`onPrintError-${printJobId}`, (_event, error) => {
				setIsPrinting(false);
				if (onPrintError) {
					onPrintError('print', error);
				}
			});
		} else {
			console.error('ipcRenderer not available');
		}
	}, [externalURL, onBeforePrint, onAfterPrint, onPrintError]);

	return { print, isPrinting };
};
