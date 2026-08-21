import { useSubscription } from 'observable-hooks';

import { useBarcodeDetection } from '../hooks/barcodes';

/**
 * Scans land in Orders search (#1440), targeting receipt order-number barcodes;
 * leaf focus keeps this inactive while other screens own the scan (#1409/#1438).
 */
export const useBarcode = (setSearch: (search: string) => void) => {
	const { barcode$, onKeyPress } = useBarcodeDetection();

	useSubscription(barcode$, (barcode) => setSearch(String(barcode)));

	return { onKeyPress };
};
