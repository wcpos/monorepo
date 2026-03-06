import * as React from 'react';

import * as Print from 'expo-print';

import { getLogger } from '@wcpos/utils/logger';

import type { UsePrintExternalURLOptions } from './types';

const printLogger = getLogger(['wcpos', 'print', 'external']);

export function usePrintExternalURL(options: UsePrintExternalURLOptions) {
	const [isPrinting, setIsPrinting] = React.useState(false);

	const print = React.useCallback(async () => {
		const { externalURL, html, onBeforePrint, onAfterPrint, onPrintError } = options;

		if (!html && !externalURL) {
			printLogger.warn('No HTML or external URL provided to print');
			return;
		}

		try {
			setIsPrinting(true);

			const beforePrintResult = onBeforePrint?.();
			if (beforePrintResult instanceof Promise) {
				await beforePrintResult;
			}

			let printHtml: string;

			if (html) {
				printHtml = html;
			} else {
				const response = await fetch(externalURL!);
				if (!response.ok) {
					throw new Error(`Failed to fetch receipt: ${response.status} ${response.statusText}`);
				}
				printHtml = await response.text();
			}

			await Print.printAsync({ html: printHtml });

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
