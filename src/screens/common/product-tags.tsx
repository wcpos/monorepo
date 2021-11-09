import * as React from 'react';
import set from 'lodash/set';
import Tag from '@wcpos/common/src/components/tag';
import useQuery from '@wcpos/common/src/hooks/use-query';

type ProductTagsProps = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const ProductTags = ({ item: product }: ProductTagsProps) => {
	const { tags } = product;
	const { setQuery } = useQuery();

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
	return tags ? <Tag.Group tags={tagsArray} /> : <Tag.Group.Skeleton numberOfTags={2} />;
};

export default ProductTags;
