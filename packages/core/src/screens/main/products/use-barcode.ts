import { useSubscription } from 'observable-hooks';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { useBarcodeDetection, useBarcodeSearch } from '../hooks/barcodes';

const barcodeLogger = getLogger(['wcpos', 'barcode', 'product']);

export const useBarcode = (setSearch: (search: string) => void) => {
	const { barcode$, onKeyPress } = useBarcodeDetection();
	const { barcodeSearch } = useBarcodeSearch();
	const t = useT();

	/**
	 *
	 */
	useSubscription(barcode$, async (rawBarcode) => {
		const barcode = rawBarcode as string;
		const text1 = t('common.barcode_scanned', { barcode });
		const results = await barcodeSearch(barcode);
		let text2;
		let isError = false;

		text2 = t('common.product_found_locally', { count: results.length });
		if (results.length !== 1) {
			isError = true;
		}

		if (isError) {
			barcodeLogger.error(text1, {
				showToast: true,
				saveToDb: true,
				toast: {
					text2,
				},
				context: {
					errorCode: ERROR_CODES.RECORD_NOT_FOUND,
					barcode,
					resultsCount: results.length,
				},
			});
		} else {
			barcodeLogger.info(text1, {
				showToast: true,
				toast: {
					text2,
				},
				context: {
					barcode,
					resultsCount: results.length,
				},
			});
		}
		setSearch(barcode);
	});

	return { onKeyPress };
};
