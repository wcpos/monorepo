import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Pill from '@wcpos/components/src/pill';
import TextInput from '@wcpos/components/src/textinput';

import { t } from '../../../../lib/translations';
import useProductCategories from '../../contexts/categories';
import useProducts from '../../contexts/products';
import useProductTags from '../../contexts/tags';

const ProductSearch = () => {
	const { query$, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const { data: categories, pullDocument: pullCategory } = useProductCategories();
	const { data: tags, pullDocument: pullTag } = useProductTags();
	const theme = useTheme();

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
				<Pill
					key="category"
					removable
					onRemove={() => setQuery('selector.categories', null)}
					icon="folders"
				>
					{category.name}
				</Pill>
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
				<Pill key="tag" removable onRemove={() => setQuery('selector.tags', null)} icon="tag">
					{tag.name}
				</Pill>
			);
		}

		// special case for prioritised fetching
		if (tagID && !tag) {
			pullTag(tagID);
		}

		const barcode = get(query, ['selector', 'barcode']);
		if (barcode) {
			array.push(
				<Pill
					key="barcode"
					removable
					onRemove={() => setQuery('selector.barcode', null)}
					icon="barcode"
				>
					{barcode}
				</Pill>
			);
		}

		return array.length !== 0 ? (
			<Pill.Group style={{ paddingLeft: theme.spacing.small }}>{array}</Pill.Group>
		) : undefined;
	}, [categories, pullCategory, pullTag, query, setQuery, tags, theme.spacing.small]);

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

export default ProductSearch;
