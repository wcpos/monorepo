import * as React from 'react';
import useObservable from '@wcpos/common/src/hooks/use-observable';
import Tag from '@wcpos/common/src/components/tag';
import { ProductQueryContext } from '../../../products';

interface POSProductCategoryProps {
	product: import('@wcpos/common/src/database').ProductDocument;
}

const Categories = ({ product }: POSProductCategoryProps) => {
	const categories = useObservable(product.categories$, []);
	const { query, setQuery } = React.useContext(ProductQueryContext);

	const handleSelectCategory = (category: any) => {
		query.filter.categories = [category];
		setQuery({ ...query });
	};

	return categories.map((category: any) => (
		<Tag key={category.id} onPress={() => handleSelectCategory(category)}>
			{category.name}
		</Tag>
	));
};

export default Categories;
