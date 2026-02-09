import { useObservableEagerState, useSubscription } from 'observable-hooks';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useBarcodeDetection, useBarcodeSearch } from '../../hooks/barcodes';
import { useCollection } from '../../hooks/use-collection';
import { useAddProduct } from '../hooks/use-add-product';
import { useAddVariation } from '../hooks/use-add-variation';

const barcodeLogger = getLogger(['wcpos', 'barcode', 'pos']);

type ProductCollection = import('@wcpos/database').ProductCollection;
type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;
type Query = import('@wcpos/query').RelationalQuery<ProductCollection>;

interface SearchInputRef {
	setSearch: (search: string) => void;
	onSearch: (search: string) => void;
}

export const useBarcode = (
	productQuery: Query,
	querySearchInputRef: React.RefObject<SearchInputRef | null>
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
	useSubscription(barcode$, async (barcode: unknown) => {
		const barcodeStr = String(barcode);
		const text1 = t('common.barcode_scanned', { barcode: barcodeStr });
		const results = await barcodeSearch(barcodeStr);

		if (results.length !== 1) {
			barcodeLogger.error(text1, {
				showToast: true,
				saveToDb: true,
				toast: {
					text2: t('common.product_found_locally', { count: results.length }),
				},
				context: {
					errorCode: ERROR_CODES.RECORD_NOT_FOUND,
					barcode: barcodeStr,
					resultsCount: results.length,
				},
			});
			productQuery.search(barcodeStr);
			(querySearchInputRef.current as SearchInputRef | null)?.setSearch(barcodeStr);
			return;
		}

		const [product] = results;

		/**
		 * TODO: what if product is out of stock?
		 */
		if (!showOutOfStock && product.stock_status !== 'instock') {
			barcodeLogger.warn(text1, {
				showToast: true,
				toast: {
					text2: t('pos_products.out_of_stock', { name: product.name }),
				},
				context: {
					barcode: barcodeStr,
					productId: product.id,
					productName: product.name,
					stockStatus: product.stock_status,
				},
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
				productQuery.search(barcodeStr);
				(querySearchInputRef.current as SearchInputRef | null)?.setSearch(barcodeStr);
				return;
			}

			const parent = await productCollection.findOne({ selector: { id: parent_id } }).exec();
			if (!parent) {
				productQuery.search(barcodeStr);
				(querySearchInputRef.current as SearchInputRef | null)?.setSearch(barcodeStr);
				return;
			}

			const metaData = (product.attributes ?? []).map(
				(attribute: { id?: number; name?: string; option?: string }) => {
					return {
						attr_id: attribute.id ?? 0,
						display_key: attribute.name ?? '',
						display_value: attribute.option ?? '',
					};
				}
			);

			addVariation(product as ProductVariationDocument, parent, metaData);
		} else {
			addProduct(product as ProductDocument);
		}

		/**
		 * Show success message
		 */
		barcodeLogger.success(text1, {
			showToast: true,
			saveToDb: true,
			toast: {
				text2: t('common.added_to_cart', { name: product.name }),
			},
			context: {
				barcode: barcodeStr,
				productId: product.id,
				productName: product.name,
			},
		});

		// clear search after successful scan?
		(querySearchInputRef.current as SearchInputRef | null)?.onSearch('');
	});

	return { onKeyPress };
};
