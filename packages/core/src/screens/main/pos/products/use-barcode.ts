import { useSubscription, useObservableEagerState } from 'observable-hooks';

import { Toast } from '@wcpos/components/src/toast';

import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useBarcodeDetection, useBarcodeSearch } from '../../hooks/barcodes';
import { useCollection } from '../../hooks/use-collection';
import { useAddProduct } from '../hooks/use-add-product';
import { useAddVariation } from '../hooks/use-add-variation';

import type { QuerySearchInput } from '../../components/query-search-input';

type ProductCollection = import('@wcpos/database').ProductCollection;
type Query = import('@wcpos/query').RelationalQuery<ProductCollection>;

export const useBarcode = (
	productQuery: Query,
	querySearchInputRef: React.RefObject<typeof QuerySearchInput>
) => {
	const { barcode$, onKeyPress } = useBarcodeDetection();
	const { barcodeSearch } = useBarcodeSearch();
	const { addProduct } = useAddProduct();
	const { addVariation } = useAddVariation();
	const t = useT();
	const { collection: productCollection } = useCollection('products');
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);

	/**
	 *
	 */
	useSubscription(barcode$, async (barcode) => {
		const text1 = t('Barcode scanned: {barcode}', { barcode, _tags: 'core' });
		const results = await barcodeSearch(barcode);

		if (results.length === 0 || results.length > 1) {
			Toast.show({
				text1,
				text2: t('{count} products found locally', { count: results.length, _tags: 'core' }),
				type: 'error',
			});
			productQuery.search(barcode);
			querySearchInputRef.current?.setSearch(barcode);
			return;
		}

		const [product] = results;

		/**
		 * TODO: what if product is out of stock?
		 */
		if (!showOutOfStock && product.stock_status !== 'instock') {
			Toast.show({
				text1,
				text2: t('{name} out of stock', { name: product.name, _tags: 'core' }),
				type: 'error',
			});
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
				querySearchInputRef.current?.setSearch(barcode);
				return;
			}

			const parent = await productCollection.findOne({ selector: { id: parent_id } }).exec();
			if (!parent) {
				productQuery.search(barcode);
				querySearchInputRef.current?.setSearch(barcode);
				return;
			}
			addVariation(product, parent);
		} else {
			addProduct(product);
		}

		/**
		 * Show success message
		 */
		Toast.show({
			text1,
			text2: t('{name} added to cart', { name: product.name, _tags: 'core' }),
			type: 'success',
		});

		// clear search after successful scan?
		querySearchInputRef.current?.onSearch('');
	});

	return { onKeyPress };
};
