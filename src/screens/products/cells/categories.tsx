import * as React from 'react';
import useObservable from '@wcpos/common/src/hooks/use-observable';
import Tag from '@wcpos/common/src/components/tag';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const ProductCategories = ({ item: product }: Props) => {
	const categories = useObservable(product.categories$);
	// const { query, setQuery } = React.useContext(ProductQueryContext);

	const handleSelectCategory = (category: any) => {
		// query.filter.categories = [category];
		// setQuery({ ...query });
	};

	const tagsArray =
		categories &&
		categories.map((cat: any) => ({
			key: cat.id,
			label: cat.name,
			action: () => handleSelectCategory(cat),
		}));

	return categories ? <Tag.Group tags={tagsArray} /> : <Tag.Group.Skeleton numberOfTags={2} />;
};

export default ProductCategories;
