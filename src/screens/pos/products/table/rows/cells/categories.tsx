import * as React from 'react';
import useObservable from '@wcpos/common/src/hooks/use-observable';
import Tag from '@wcpos/common/src/components/tag';

interface POSProductCategoryProps {
	product: import('@wcpos/common/src/database').ProductDocument;
}

const Categories = ({ product }: POSProductCategoryProps) => {
	const categories = useObservable(product.categories$, []);

	const handleClick = (category) => {
		console.log('filter by cat ', category);
	};

	return categories.map((category) => (
		<Tag key={category.id} onPress={() => handleClick(category)}>
			{category.name}
		</Tag>
	));
};

export default Categories;
