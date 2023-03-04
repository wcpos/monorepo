import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Pill from '@wcpos/components/src/pill';
import TextInput from '@wcpos/components/src/textinput';
import { useDetectBarcode } from '@wcpos/hooks/src/use-hotkeys';

import { t } from '../../../../lib/translations';
import useProductCategories from '../../contexts/categories';
import useProducts from '../../contexts/products';
import useProductTags from '../../contexts/tags';
import usePullDocument from '../../contexts/use-pull-document';
import useCurrentOrder from '../contexts/current-order';

const SearchBar = () => {
	const { query$, setQuery, data: products } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const { data: categories, pullDocument: pullCategory } = useProductCategories();
	const { data: tags, pullDocument: pullTag } = useProductTags();
	const { addProduct } = useCurrentOrder();
	useDetectBarcode((barcode) => {
		setQuery('selector.barcode', barcode);
	});

	/**
	 *
	 */
	React.useEffect(() => {
		const barcode = get(query, ['selector', 'barcode']);
		if (barcode && isEmpty(query.search) && products.length === 1) {
			addProduct(products[0]);
			setQuery('selector.barcode', null);
		}
	}, [query, products, addProduct, setQuery]);

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search: string) => {
			setQuery('search', search);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const filters = React.useMemo(() => {
		const array = [];
		const categoryID = get(query, ['selector', 'categories', '$elemMatch', 'id']);
		const category = categories.find((c) => c.id === categoryID);
		if (category) {
			array.push(
				<Box paddingLeft="small">
					<Pill removable onRemove={() => setQuery('selector.categories', null)} icon="folders">
						{category.name}
					</Pill>
				</Box>
			);
		}

		// special case for prioritised fetching
		if (categoryID && !category) {
			pullCategory(categoryID);
		}

		const tagID = get(query, ['selector', 'tags', '$elemMatch', 'id']);
		const tag = tags.find((t) => t.id === tagID);
		if (tag) {
			array.push(
				<Box paddingLeft="small">
					<Pill removable onRemove={() => setQuery('selector.tags', null)} icon="tag">
						{tag.name}
					</Pill>
				</Box>
			);
		}

		// special case for prioritised fetching
		if (tagID && !tag) {
			pullTag(tagID);
		}

		const barcode = get(query, ['selector', 'barcode']);
		if (barcode) {
			array.push(
				<Box paddingLeft="small">
					<Pill removable onRemove={() => setQuery('selector.barcode', null)} icon="barcode">
						{barcode}
					</Pill>
				</Box>
			);
		}

		return array;
	}, [categories, pullCategory, pullTag, query, setQuery, tags]);

	/**
	 *
	 */
	return (
		<TextInput
			placeholder={t('Search Products', { _tags: 'core' })}
			value={query.search}
			onChangeText={onSearch}
			leftAccessory={filters}
			containerStyle={{ flex: 1 }}
			clearable
		/>
	);
};

export default SearchBar;
