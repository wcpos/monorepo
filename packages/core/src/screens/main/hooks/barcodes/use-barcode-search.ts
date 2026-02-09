import * as React from 'react';

import { useCollection } from '../use-collection';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

export const useBarcodeSearch = () => {
	// Get the RxDB collections for products and variations
	const { collection: productCollection } = useCollection('products');
	const { collection: variationsCollection } = useCollection('variations');

	/**
	 * Searches for a barcode in the product and variation collections.
	 *
	 * @param barcode - The barcode to search for.
	 * @returns {Promise<(ProductDocument | ProductVariationDocument)[]>} - A promise that resolves to an array containing the search results.
	 */
	const barcodeSearch = React.useCallback(
		async (barcode: string): Promise<(ProductDocument | ProductVariationDocument)[]> => {
			const result = await Promise.all([
				productCollection
					.find({
						selector: {
							barcode,
						},
					})
					.exec(),
				variationsCollection
					.find({
						selector: {
							barcode,
						},
					})
					.exec(),
			]);

			return [...result[0], ...result[1]];
		},
		[productCollection, variationsCollection]
	);

	return { barcodeSearch };
};
