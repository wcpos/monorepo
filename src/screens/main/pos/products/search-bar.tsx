import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Pill from '@wcpos/components/src/pill';
import TextInput from '@wcpos/components/src/textinput';
import { useDetectBarcode } from '@wcpos/hooks/src/use-hotkeys';

import { t } from '../../../../lib/translations';
import useProductCategories from '../../contexts/categories';
import useProducts from '../../contexts/products';
import useProductTags from '../../contexts/tags';

const SearchBar = () => {
	const { query$, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	useDetectBarcode((barcode) => {
		console.log(barcode);
	});
	const { data: categories } = useProductCategories();
	const { data: tags } = useProductTags();

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
		const categoryID = get(query, ['selector', 'categories', '$elemMatch', 'id']);
		const category = categories.find((c) => c.id === categoryID);
		if (category) {
			return (
				<Box paddingLeft="small">
					<Pill removable onRemove={() => setQuery('selector.categories', null)} icon="folders">
						{category.name}
					</Pill>
				</Box>
			);
		}

		const tagID = get(query, ['selector', 'tags', '$elemMatch', 'id']);
		const tag = tags.find((t) => t.id === tagID);
		if (tag) {
			return (
				<Box paddingLeft="small">
					<Pill removable onRemove={() => setQuery('selector.tags', null)} icon="tag">
						{tag.name}
					</Pill>
				</Box>
			);
		}

		const barcode = get(query, ['barcode']);
		if (barcode) {
			return (
				<Box paddingLeft="small">
					<Pill removable onRemove={() => setQuery('barcode', null)} icon="barcode">
						{barcode}
					</Pill>
				</Box>
			);
		}
	}, [categories, query, setQuery, tags]);

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
