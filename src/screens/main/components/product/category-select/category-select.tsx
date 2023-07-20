import * as React from 'react';
import { View } from 'react-native';

import Popover from '@wcpos/components/src/popover';
import log from '@wcpos/utils/src/logger';

import CategorySelectMenu from './menu';
import SearchInput from './search-input';
import { t } from '../../../../../lib/translations';
import { ProductCategoriesProvider } from '../../../contexts/categories';
import { useProducts } from '../../../contexts/products';

type ProductCategoryDocument = import('@wcpos/database').ProductCategoryDocument;

/**
 *
 * @returns
 */
const CategorySelectSearch = ({ onBlur }) => {
	const [opened, setOpened] = React.useState(false);
	const { setQuery: setProductsQuery } = useProducts();
	const categorySelectMenuRef = React.useRef(null);

	/**
	 *
	 */
	const onSearch = React.useCallback((search) => {
		if (categorySelectMenuRef.current) {
			categorySelectMenuRef.current.onSearch(search);
		}
	}, []);

	/**
	 *
	 */
	const onSelectCategory = React.useCallback(
		(category: ProductCategoryDocument) => {
			setProductsQuery('selector.categories.$elemMatch.id', category.id);
		},
		[setProductsQuery]
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
	const initialQuery = React.useMemo(
		() => ({
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
				<ProductCategoriesProvider initialQuery={initialQuery}>
					<React.Suspense>
						<CategorySelectMenu ref={categorySelectMenuRef} onChange={onSelectCategory} />
					</React.Suspense>
				</ProductCategoriesProvider>
			</Popover.Content>
		</Popover>
	);
};

export default CategorySelectSearch;
