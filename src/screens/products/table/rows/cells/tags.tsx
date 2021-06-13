import * as React from 'react';
import useObservable from '@wcpos/common/src/hooks/use-observable';
import Tag from '@wcpos/common/src/components/tag';
// import { ProductQueryContext } from '../../../products';

type ProductTagsProps = {
	product: import('@wcpos/common/src/database').ProductDocument;
};

const ProductTags = ({ product }: ProductTagsProps) => {
	const tags = useObservable(product.tags$);
	// const { query, setQuery } = React.useContext(ProductQueryContext);

	const handleSelectTag = (tag: any) => {
		// query.filter.tags = [tag];
		// setQuery({ ...query });
	};

	const tagsArray =
		tags &&
		tags.map((tag: any) => ({
			key: tag.id,
			label: tag.name,
			action: () => handleSelectTag(tag),
		}));

	return tags ? <Tag.Group tags={tagsArray} /> : <Tag.Group.Skeleton numberOfTags={2} />;
};

export default ProductTags;
