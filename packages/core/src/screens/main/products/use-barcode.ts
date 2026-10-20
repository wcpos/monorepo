import { useSubscription } from 'observable-hooks';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

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
	const handleBarcode = async (rawBarcode: unknown) => {
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
			// Zero/many matches is a workflow miss, not a system failure. The level is
			// each code's registry severity: no match (PRODUCT301) is info, an ambiguous
			// barcode (PRODUCT321, a catalogue problem to fix) is warn.
			barcodeLogger[results.length === 0 ? 'info' : 'warn'](text1, {
				showToast: true,
				toast: {
					text2,
				},
				code:
					results.length === 0
						? ERROR_CODES.SEARCH_NO_RESULTS_REASON
						: ERROR_CODES.BARCODE_AMBIGUOUS,
				context: {
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
	};

	useSubscription(
		barcode$,
		(rawBarcode) =>
			void handleBarcode(rawBarcode).catch((error) =>
				// The scan did nothing visible; say so rather than fail silently.
				barcodeLogger.error('Barcode scan failed', {
					code: ERROR_CODES.PRODUCT_UNEXPECTED,
					showToast: true,
					context: { error: String(error) },
				})
			)
	);

	return { onKeyPress };
};
