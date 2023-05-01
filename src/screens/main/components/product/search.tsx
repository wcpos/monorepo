import * as React from 'react';

import get from 'lodash/get';
import { useLayoutObservableState, useSubscription } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Pill from '@wcpos/components/src/pill';
import TextInput from '@wcpos/components/src/textinput';

import { t } from '../../../../lib/translations';
import useProductCategories from '../../contexts/categories';
import useProducts from '../../contexts/products';
import useProductTags from '../../contexts/tags';
import usePullDocument from '../../contexts/use-pull-document';
import { useBarcodeDetection, useBarcodeSearch } from '../../hooks/barcodes';
import useCollection from '../../hooks/use-collection';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 * Category Pill
 */
const CategoryPill = ({ categoryID, onRemove }) => {
	const { data, collection } = useProductCategories();
	const category = data.find((c) => c.id === categoryID);
	const pullDocument = usePullDocument();

	if (!category) {
		pullDocument(categoryID, collection);

		return <Pill.Skeleton />;
	}

	return (
		<Pill key="category" removable onRemove={onRemove} icon="folders">
			{category.name}
		</Pill>
	);
};

/**
 * Tag Pill
 */
const TagPill = ({ tagID, onRemove }) => {
	const { data, collection } = useProductTags();
	const tag = data.find((t) => t.id === tagID);
	const pullDocument = usePullDocument();

	if (!tag) {
		pullDocument(tagID, collection);

		return <Pill.Skeleton />;
	}

	return (
		<Pill key="tag" removable onRemove={onRemove} icon="tag">
			{tag.name}
		</Pill>
	);
};

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
	const { query$, setQuery } = useProducts();
	// const query = useObservableEagerState(query$);
	const query = useLayoutObservableState(query$, query$.getValue());
	const theme = useTheme();
	const [search, setSearch] = React.useState(query.search);
	const categoryID = get(query, ['selector', 'categories', '$elemMatch', 'id']);
	const tagID = get(query, ['selector', 'tags', '$elemMatch', 'id']);
	const [enabled, setEnabled] = React.useState(false);
	const { barcode$, onKeyboardEvent } = useBarcodeDetection({ options: { enabled } });
	const barcode = get(query, ['selector', 'barcode']);
	const { barcodeSearch } = useBarcodeSearch();
	const productsCollection = useCollection('products');

	const hasFilters = categoryID || tagID || barcode;

	const onSearch = React.useCallback(
		(search) => {
			setSearch(search);
			setQuery('search', search, true);
		},
		[setQuery]
	);

	/**
	 * Subscribe to barcode$ and add product to cart if found, or update query
	 */
	useSubscription(barcode$, async (barcode) => {
		if (addProduct && enabled) {
			const result = await barcodeSearch(barcode);
			if (Array.isArray(result) && result.length > 0) {
				if (result[0].collection.name === 'variations') {
					// if it's a variation, we need to get the parent product
					// TODO: perhaps it's better to have a look up table for variations/parents?
					const parent = await productsCollection
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
			}
		}
	});

	// FIXME: hack to only get barcode events on POS Products
	React.useEffect(() => {
		if (addProduct) {
			setEnabled(true);
		}
		return () => {
			setEnabled(false);
		};
	});

	/**
	 *
	 */
	return (
		<TextInput
			placeholder={t('Search Products', { _tags: 'core' })}
			value={search}
			onChangeText={onSearch}
			leftAccessory={
				hasFilters && (
					<Pill.Group style={{ paddingLeft: theme.spacing.small }}>
						{categoryID && (
							<CategoryPill
								categoryID={categoryID}
								onRemove={() => setQuery('selector.categories', null)}
							/>
						)}
						{tagID && <TagPill tagID={tagID} onRemove={() => setQuery('selector.tags', null)} />}
					</Pill.Group>
				)
			}
			containerStyle={{ flex: 1 }}
			clearable
			onKeyPress={onKeyboardEvent}
		/>
	);
};

export default ProductSearch;
