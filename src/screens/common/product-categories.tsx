import * as React from 'react';
import set from 'lodash/set';
import Tag from '@wcpos/components/src/tag';
import useProducts from '@wcpos/hooks/src/use-products';

interface ProductCategoriesProps {
	item: import('@wcpos/database').ProductDocument;
}

const ProductCategories = ({ item: product }: ProductCategoriesProps) => {
	const { categories } = product;
	const { setQuery } = useProducts();

	/**
	 *
	 */
	const handleSelectCategory = React.useCallback(
		(category: any) => {
			setQuery('filters.category', category);
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
