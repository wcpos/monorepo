import * as React from 'react';
import Tag from '@wcpos/common/src/components/tag';

type ProductTagsProps = {
	item: import('@wcpos/common/src/database').ProductDocument;
	setQuery?: any;
};

const ProductTags = ({ item: product, setQuery }: ProductTagsProps) => {
	const { tags } = product;

	/**
	 *
	 */
	const handleSelectTag = React.useCallback(
		(tag: any) => {
			setQuery((prev: any) => ({ ...prev, tag }));
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
