import * as React from 'react';

import Pill from '@wcpos/components/src/pill';
import { useTable } from '@wcpos/tailwind/src/table';

interface ProductCategoriesProps {
	item: import('@wcpos/database').ProductDocument;
}

const ProductCategories = ({ item: product }: ProductCategoriesProps) => {
	const { categories } = product;
	const { query } = useTable();

	/**
	 *
	 */
	const handleSelectCategory = React.useCallback(
		(category: any) => {
			query.where('categories', { $elemMatch: { id: category.id } });
		},
		[query]
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
	return <Pill.Group pills={catArray} size="small" color="secondary" />;
};

export default ProductCategories;
