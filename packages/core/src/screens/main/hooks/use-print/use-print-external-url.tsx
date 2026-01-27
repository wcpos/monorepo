import * as React from 'react';

import * as Print from 'expo-print';

import { getLogger } from '@wcpos/utils/logger';

import type { UsePrintExternalURLOptions } from './types';

const printLogger = getLogger(['wcpos', 'print', 'external']);

export function usePrintExternalURL(options: UsePrintExternalURLOptions) {
	const [isPrinting, setIsPrinting] = React.useState(false);

	const print = React.useCallback(async () => {
		const { externalURL, onBeforePrint, onAfterPrint, onPrintError } = options;

		if (!externalURL) {
			printLogger.warn('No external URL provided to print');
			return;
		}

		try {
			setIsPrinting(true);

			// Call onBeforePrint if provided
			const beforePrintResult = onBeforePrint?.();
			if (beforePrintResult instanceof Promise) {
				await beforePrintResult;
			}

			// Fetch HTML content from the URL
			const response = await fetch(externalURL);
			if (!response.ok) {
				throw new Error(`Failed to fetch receipt: ${response.status} ${response.statusText}`);
			}
			const html = await response.text();

			// Print using expo-print
			await Print.printAsync({ html });

			// Call onAfterPrint if provided
			onAfterPrint?.();
		} catch (error) {
			printLogger.error('Print error', { context: { error } });
			onPrintError?.('print', error as Error);
		} finally {
			setIsPrinting(false);
		}
	}, [options]);

	return { print, isPrinting };
}
