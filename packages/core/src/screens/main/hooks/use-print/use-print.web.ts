import * as React from 'react';

import { useReactToPrint } from 'react-to-print';

import { getLogger } from '@wcpos/utils/logger';

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
	const promiseResolveRef = React.useRef<(() => void) | null>(null);

	// Needed for react-to-print: resolves the Promise when isPrinting becomes true
	React.useEffect(() => {
		if (isPrinting && promiseResolveRef.current) {
			promiseResolveRef.current();
		}
	}, [isPrinting]);

	const print = useReactToPrint({
		contentRef,
		pageStyle: pageStyle || DEFAULT_PAGE_STYLE,
		onPrintError: (errorLocation, error) => {
			printLogger.error(`Print error in ${errorLocation}`, { context: { error } });
			onPrintError?.(errorLocation, error);
		},
		onBeforePrint: () => {
			return new Promise<void>((resolve) => {
				promiseResolveRef.current = resolve;
				setIsPrinting(true);
				// Call user's onBeforePrint if provided
				const result = onBeforePrint?.();
				if (result instanceof Promise) {
					result.then(resolve).catch(() => resolve());
				} else {
					resolve();
				}
			});
		},
		onAfterPrint: () => {
			// Reset the Promise resolve so we can print again
			promiseResolveRef.current = null;
			setIsPrinting(false);
			onAfterPrint?.();
		},
	});

	return { print, isPrinting };
};
