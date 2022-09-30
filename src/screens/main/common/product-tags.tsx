import * as React from 'react';
import set from 'lodash/set';
import Pill from '@wcpos/components/src/pill';
import useProducts from '@wcpos/core/src/contexts/products';

type ProductTagsProps = {
	item: import('@wcpos/database').ProductDocument;
};

const ProductTags = ({ item: product }: ProductTagsProps) => {
	const { tags } = product;
	const { setQuery } = useProducts();

	/**
	 *
	 */
	const handleSelectTag = React.useCallback(
		(tag: any) => {
			setQuery('filters.tag', tag);
		},
		[setQuery]
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
	return tags ? <Pill.Group pills={tagsArray} /> : <Pill.Group.Skeleton number={2} />;
};

export default ProductTags;
