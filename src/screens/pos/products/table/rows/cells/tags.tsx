import * as React from 'react';
import Tag from '@wcpos/common/src/components/tag';
import { ProductQueryContext } from '../../../products';

type ProductTagsProps = {
	product: import('@wcpos/common/src/database').ProductDocument;
};

const ProductTags = ({ product }: ProductTagsProps) => {
	const { query, setQuery } = React.useContext(ProductQueryContext);
	const { tags } = product;

	/**
	 *
	 */
	const handleSelectTag = React.useCallback(
		(tag: any) => {
			query.filter.tags = [tag];
			setQuery({ ...query });
		},
		[query, setQuery]
	);

	/**
	 *
	 */
	const tagsArray = React.useMemo(() => {
		if (Array.isArray(tags)) {
			return tags.map((tag: any) => {
				return {
					key: tag.id,
					label: tag.name,
					action: () => handleSelectTag(tag),
				};
			});
		}
		return [];
	}, [tags, handleSelectTag]);

	/**
	 *
	 */
	return tags ? <Tag.Group tags={tagsArray} /> : <Tag.Group.Skeleton numberOfTags={2} />;
};

export default ProductTags;
