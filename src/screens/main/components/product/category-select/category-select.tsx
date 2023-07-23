import * as React from 'react';
import { View } from 'react-native';

import Popover from '@wcpos/components/src/popover';
import log from '@wcpos/utils/src/logger';

import CategorySelectMenu from './menu';
import SearchInput from './search-input';
import { t } from '../../../../../lib/translations';
import { ProductCategoriesProvider } from '../../../contexts/categories';
import { useProducts } from '../../../contexts/products';
import { Query } from '../../../contexts/query';

type ProductCategoryDocument = import('@wcpos/database').ProductCategoryDocument;

/**
 *
 * @returns
 */
const CategorySelectSearch = ({ onBlur }) => {
	const [opened, setOpened] = React.useState(false);
	const { query: productQuery } = useProducts();

	/**
	 *
	 */
	const categoryQuery = React.useMemo(
		() =>
			new Query({
				// search: '',
				sortBy: 'name',
				sortDirection: 'asc',
				// limit: 10,
			}),
		[]
	);

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			categoryQuery.debouncedSearch(search);
		},
		[categoryQuery]
	);

	/**
	 *
	 */
	const onSelectCategory = React.useCallback(
		(category: ProductCategoryDocument) => {
			productQuery.where('categories', { $elemMatch: { id: category.id } });
		},
		[productQuery]
	);

	/**
	 *
	 */
	// const placeholder = React.useMemo(() => {
	// 	if (selectedCategory) {
	// 		debugger;
	// 	}

	// 	return t('Search Categories', { _tags: 'core' });
	// }, [selectedCategory]);

	/**
	 *
	 */
	return (
		<Popover
			opened={opened}
			//onOpen={() => setOpened(true)}
			onClose={() => setOpened(false)}
			withArrow={false}
			matchWidth
			withinPortal={false}
		>
			<Popover.Target>
				<SearchInput setOpened={setOpened} onSearch={onSearch} onBlur={onBlur} />
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<ProductCategoriesProvider query={categoryQuery}>
					<React.Suspense>
						<CategorySelectMenu onChange={onSelectCategory} />
					</React.Suspense>
				</ProductCategoriesProvider>
			</Popover.Content>
		</Popover>
	);
};

export default CategorySelectSearch;
