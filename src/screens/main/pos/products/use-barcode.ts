import { useSubscription, useObservableEagerState } from 'observable-hooks';

import useSnackbar from '@wcpos/components/src/snackbar';

import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useBarcodeDetection, useBarcodeSearch } from '../../hooks/barcodes';
import { useCollection } from '../../hooks/use-collection';
import { useAddProduct } from '../hooks/use-add-product';
import { useAddVariation } from '../hooks/use-add-variation';

type ProductCollection = import('@wcpos/database').ProductCollection;
type Query = import('@wcpos/query').RelationalQuery<ProductCollection>;

export const useBarcode = (productQuery: Query) => {
	const { barcode$ } = useBarcodeDetection();
	const { barcodeSearch } = useBarcodeSearch();
	const { addProduct } = useAddProduct();
	const { addVariation } = useAddVariation();
	const showSnackbar = useSnackbar();
	const t = useT();
	const { collection: productCollection } = useCollection('products');
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);

	/**
	 *
	 */
	useSubscription(barcode$, async (barcode) => {
		let message = t('Barcode scanned: {barcode}', { barcode, _tags: 'core' });
		const results = await barcodeSearch(barcode);

		if (results.length === 0 || results.length > 1) {
			message +=
				', ' + t('{count} products found locally', { count: results.length, _tags: 'core' });

			showSnackbar({ message });
			productQuery.search(barcode);
			return;
		}

		message += ', ' + t('1 product found locally', { _tags: 'core' });

		showSnackbar({ message });
		const [product] = results;

		/**
		 * TODO: what if product is out of stock?
		 */
		if (!showOutOfStock && product.stock_status !== 'instock') {
			productQuery.search(barcode);
			return;
		}

		if (product.collection.name === 'variations') {
			/**
			 * Hack: we need to get the parent product
			 * - parent_id was added recently to the variation schema, so older variations don't have it
			 */
			const parent_id = product.parent_id;
			if (!parent_id) {
				productQuery.search(barcode);
				return;
			}
			const parent = await productCollection.findOne({ selector: { id: parent_id } }).exec();
			if (!parent) {
				productQuery.search(barcode);
				return;
			}
			addVariation(product, parent);
		} else {
			addProduct(product);
		}

		// clear search after successful scan?
		productQuery.search('');
	});
};
