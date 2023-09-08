import * as React from 'react';

import get from 'lodash/get';
import { useLayoutObservableState, useSubscription } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Pill from '@wcpos/components/src/pill';
import TextInput from '@wcpos/components/src/textinput';

import { useT } from '../../../../contexts/translations';
import { useBarcodeDetection, useBarcodeSearch } from '../../hooks/barcodes';
import { useCollection } from '../../hooks/use-collection';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 * Barcode Pill
 */
// const BarcodePill = () => {
// 	const barcode = get(query, ['selector', 'barcode']);

// 	return (
// 		<Pill
// 			key="barcode"
// 			removable
// 			onRemove={() => setQuery('selector.barcode', null)}
// 			icon="barcode"
// 		>
// 			{barcode}
// 		</Pill>
// 	);
// };

/**
 * Search field
 */
const ProductSearch = ({
	query,
	addProduct,
	addVariation,
}: {
	addProduct?: (product: ProductDocument) => Promise<void>;
	addVariation?: (
		variation: ProductVariationDocument,
		parent: ProductDocument,
		metaData: any
	) => Promise<void>;
}) => {
	const [search, setSearch] = React.useState('');
	const { barcode$ } = useBarcodeDetection();
	const { barcodeSearch } = useBarcodeSearch();
	const { collection } = useCollection('products');
	const t = useT();

	const onSearch = React.useCallback(
		(search) => {
			setSearch(search);
			query.debouncedSearch(search);
		},
		[query]
	);

	/**
	 * Subscribe to barcode$ and add product to cart if found, or update query
	 */
	useSubscription(barcode$, async (barcode) => {
		if (addProduct && addVariation) {
			const result = await barcodeSearch(barcode);
			if (Array.isArray(result) && result.length > 0) {
				if (result[0].collection.name === 'variations') {
					// if it's a variation, we need to get the parent product
					// TODO: perhaps it's better to have a look up table for variations/parents?
					const parent = await collection
						.findOne({
							selector: {
								variations: {
									$in: [result[0].id],
								},
							},
						})
						.exec();
					const metaData = result[0].attributes.map((attribute) => {
						return {
							attr_id: attribute.id,
							display_key: attribute.name,
							display_value: attribute.option,
						};
					});
					addVariation(result[0], parent, metaData);
				} else {
					addProduct(result[0]);
				}
			} else {
				// no result in local db, so do a search via REST API?
			}
		}
	});

	// FIXME: hack to only get barcode events on POS Products
	// Doesn't work :(
	// React.useEffect(() => {
	// 	if (addProduct) {
	// 		setEnabled(true);
	// 	}
	// 	return () => {
	// 		setEnabled(false);
	// 	};
	// });

	/**
	 *
	 */
	return (
		<TextInput
			placeholder={t('Search Products', { _tags: 'core' })}
			value={search}
			onChangeText={onSearch}
			containerStyle={{ flex: 1 }}
			clearable
			// onKeyPress={onKeyboardEvent}
		/>
	);
};

export default ProductSearch;
