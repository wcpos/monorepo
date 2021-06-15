import * as React from 'react';
import Tag from '@wcpos/common/src/components/tag';
import { ProductQueryContext } from '../../../products';

interface ProductCategoriesProps {
	product: import('@wcpos/common/src/database').ProductDocument;
}

const ProductCategories = ({ product }: ProductCategoriesProps) => {
	const { query, setQuery } = React.useContext(ProductQueryContext);
	const { categories } = product;

	/**
	 *
	 */
	const handleSelectCategory = React.useCallback(
		(category: any) => {
			query.filter.categories = [category];
			setQuery({ ...query });
		},
		[query, setQuery]
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
