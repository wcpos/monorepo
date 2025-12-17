import * as React from 'react';

import * as Print from 'expo-print';

import log from '@wcpos/utils/logger';

import type { UsePrintOptions } from './use-print.types';

/**
 * Native implementation of usePrint hook using expo-print.
 * Prints HTML content on iOS/Android.
 */
export const usePrint = (options: UsePrintOptions) => {
	const { html, onBeforePrint, onAfterPrint, onPrintError } = options;
	const [isPrinting, setIsPrinting] = React.useState(false);

	const print = React.useCallback(async () => {
		if (!html) {
			log.warn('No HTML content provided to print');
			return;
		}

		try {
			setIsPrinting(true);

			// Call onBeforePrint if provided
			const beforePrintResult = onBeforePrint?.();
			if (beforePrintResult instanceof Promise) {
				await beforePrintResult;
			}

			// Print using expo-print
			await Print.printAsync({ html });

			// Call onAfterPrint if provided
			onAfterPrint?.();
		} catch (error) {
			log.error('Print error', { context: { error } });
			onPrintError?.('print', error as Error);
		} finally {
			setIsPrinting(false);
		}
	}, [html, onBeforePrint, onAfterPrint, onPrintError]);

	return { print, isPrinting };
};
