import * as React from 'react';
import set from 'lodash/set';
import Pill from '@wcpos/components/src/pill';
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
	const catArray = React.useMemo(() => {
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
	return categories ? (
		<Pill.Group pills={catArray} size="small" color="secondary" />
	) : (
		<Pill.Group.Skeleton number={2} size="small" />
	);
};

export default ProductCategories;
