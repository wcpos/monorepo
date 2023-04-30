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
const ProductSearch = ({ addProduct }) => {
	const { query$, setQuery } = useProducts();
	// const query = useObservableEagerState(query$);
	const query = useLayoutObservableState(query$, query$.getValue());
	const theme = useTheme();
	const [search, setSearch] = React.useState(query.search);
	const categoryID = get(query, ['selector', 'categories', '$elemMatch', 'id']);
	const tagID = get(query, ['selector', 'tags', '$elemMatch', 'id']);
	const { barcode$, onKeyboardEvent } = useBarcodeDetection();
	const barcode = get(query, ['selector', 'barcode']);
	const { barcodeSearch } = useBarcodeSearch();

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
		const result = await barcodeSearch(barcode);
		if (Array.isArray(result) && result.length > 0) {
			addProduct && addProduct(result[0]);
		}
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
