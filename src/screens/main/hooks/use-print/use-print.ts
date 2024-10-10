import * as React from 'react';

import { useReactToPrint } from 'react-to-print';

import type { UseReactToPrintOptions } from 'react-to-print';

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
    }
`;

/**
 *
 */
export const usePrint = (options: UseReactToPrintOptions) => {
	const [isPrinting, setIsPrinting] = React.useState(false);
	const promiseResolveRef = React.useRef(null);

	/**
	 *
	 */
	React.useEffect(() => {
		if (isPrinting && promiseResolveRef.current) {
			// Resolves the Promise, letting `react-to-print` know that the DOM updates are completed
			promiseResolveRef.current();
		}
	}, [isPrinting]);

	/**
	 *
	 */
	const print = useReactToPrint({
		pageStyle: DEFAULT_PAGE_STYLE,
		onPrintError: (errorLocation, error) => {
			console.error(`Error in ${errorLocation}:`, error);
		},
		onBeforePrint: () => {
			return new Promise((resolve) => {
				promiseResolveRef.current = resolve;
				setIsPrinting(true);
			});
		},
		onAfterPrint: () => {
			// Reset the Promise resolve so we can print again
			promiseResolveRef.current = null;
			setIsPrinting(false);
		},
		...options,
	});

	return { print, isPrinting };
};
