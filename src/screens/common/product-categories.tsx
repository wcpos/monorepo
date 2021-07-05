import * as React from 'react';
import Tag from '@wcpos/common/src/components/tag';
import set from 'lodash/set';

interface ProductCategoriesProps {
	item: import('@wcpos/common/src/database').ProductDocument;
	setQuery?: any;
}

const ProductCategories = ({ item: product, setQuery }: ProductCategoriesProps) => {
	const { categories } = product;

	/**
	 *
	 */
	const handleSelectCategory = React.useCallback(
		(category: any) => {
			setQuery((prev: any) => set({ ...prev }, 'filters.category', category));
		},
		[setQuery]
	);

	/**
	 *
	 */
	const tagsArray = React.useMemo(() => {
		if (Array.isArray(categories)) {
			return categories.map((cat: any) => {
				return {
					key: cat.id,
					label: cat.name,
					action: () => handleSelectCategory(cat),
				};
			});
		}
		return [];
	}, [categories, handleSelectCategory]);

	/**
	 *
	 */
	return categories ? <Tag.Group tags={tagsArray} /> : <Tag.Group.Skeleton numberOfTags={2} />;
};

export default ProductCategories;
