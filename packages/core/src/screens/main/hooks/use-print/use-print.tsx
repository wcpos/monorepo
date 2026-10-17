import * as React from 'react';

import * as Print from 'expo-print';

import { getLogger } from '@wcpos/utils/logger';

import { reportPrintFailure } from './print-failure';
import { useT } from '../../../../contexts/translations';

import type { UsePrintOptions } from './use-print.types';

const printLogger = getLogger(['wcpos', 'print', 'native']);

/**
 * Native implementation of usePrint hook using expo-print.
 * Prints HTML content on iOS/Android.
 */
export const usePrint = (options: UsePrintOptions) => {
	const { html, onBeforePrint, onAfterPrint, onPrintError } = options;
	const [isPrinting, setIsPrinting] = React.useState(false);
	const t = useT();

	const print = React.useCallback(async () => {
		if (!html) {
			printLogger.debug('No HTML content provided to print');
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
			// Closing the iOS print dialog rejects too: that is a cancel, not a failure.
			reportPrintFailure(printLogger, 'Print error', error, t);
			onPrintError?.('print', error as Error);
		} finally {
			setIsPrinting(false);
		}
	}, [html, onBeforePrint, onAfterPrint, onPrintError, t]);

	return { print, isPrinting };
};
