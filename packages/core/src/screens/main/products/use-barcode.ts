import { useSubscription } from 'observable-hooks';

import { Toast } from '@wcpos/components/src/toast';

import { useT } from '../../../contexts/translations';
import { useBarcodeDetection, useBarcodeSearch } from '../hooks/barcodes';

import type { QuerySearchInput } from '../components/query-search-input';

type ProductCollection = import('@wcpos/database').ProductCollection;
type Query = import('@wcpos/query').RelationalQuery<ProductCollection>;

export const useBarcode = (
	productQuery: Query,
	querySearchInputRef: React.RefObject<typeof QuerySearchInput>
) => {
	const { barcode$, onKeyPress } = useBarcodeDetection();
	const { barcodeSearch } = useBarcodeSearch();
	const t = useT();

	/**
	 *
	 */
	useSubscription(barcode$, async (barcode) => {
		const text1 = t('Barcode scanned: {barcode}', { barcode, _tags: 'core' });
		const results = await barcodeSearch(barcode);
		let text2;
		let type = 'info';

		if (results.length === 1) {
			text2 = t('1 product found locally', { _tags: 'core' });
		}

		if (results.length === 0 || results.length > 1) {
			text2 = t('{count} products found locally', { count: results.length, _tags: 'core' });
			type = 'error';
		}

		Toast.show({ text1, text2, type });
		productQuery.search(barcode);
		querySearchInputRef.current?.setSearch(barcode);
	});

	return { onKeyPress };
};
