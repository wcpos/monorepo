import * as React from 'react';

import { useReactToPrint } from 'react-to-print';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import type { UsePrintOptions } from './use-print.types';

const printLogger = getLogger(['wcpos', 'print', 'web']);

const DEFAULT_PAGE_STYLE = `
    @page {
        /* Remove browser default header (title) and footer (url) */
        margin: 0;
    }
    @media print {
        html, body { height: 100%; }
        body {
            /* Tell browsers to print background colors */
            color-adjust: exact; /* Firefox. This is an older version of "print-color-adjust" */
            print-color-adjust: exact; /* Firefox/Safari */
            -webkit-print-color-adjust: exact; /* Chrome/Safari/Edge/Opera */
        }
        /* Force print-friendly black text on white background regardless of theme */
        * {
            background-color: white !important;
            color: black !important;
            border-color: #999 !important;
        }
    }
`;

/**
 * Web implementation of usePrint hook using react-to-print.
 * Prints DOM content via browser print diaprintLogger.
 */
export const usePrint = (options: UsePrintOptions) => {
	const { contentRef, pageStyle, onBeforePrint, onAfterPrint, onPrintError } = options;
	const [isPrinting, setIsPrinting] = React.useState(false);

	const print = useReactToPrint({
		contentRef,
		pageStyle: pageStyle || DEFAULT_PAGE_STYLE,
		onPrintError: (errorLocation, error) => {
			printLogger.error(`Print error in ${errorLocation}`, {
				code: ERROR_CODES.PRINT_UNEXPECTED,
				context: { error },
			});
			onPrintError?.(errorLocation, error);
		},
		onBeforePrint: () => {
			setIsPrinting(true);
			// react-to-print waits for this promise before opening the print dialog.
			// A rejected onBeforePrint still prints — the caller's hook is advisory.
			const result = onBeforePrint?.();
			return result instanceof Promise
				? result.then(
						() => undefined,
						() => undefined
					)
				: Promise.resolve();
		},
		onAfterPrint: () => {
			setIsPrinting(false);
			onAfterPrint?.();
		},
	});

	return { print, isPrinting };
};
