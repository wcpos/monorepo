import * as React from 'react';

import Pill from '@wcpos/components/src/pill';

import { useProducts } from '../../contexts/products';

type ProductTagsProps = {
	item: import('@wcpos/database').ProductDocument;
};

const ProductTags = ({ item: product }: ProductTagsProps) => {
	const { tags } = product;
	const { query } = useProducts();

	/**
	 *
	 */
	const handleSelectTag = React.useCallback(
		(tag: any) => {
			query.where('tags', { $elemMatch: { id: tag.id } });
		},
		[query]
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
	return <Pill.Group pills={tagsArray} size="small" color="darkestGrey" />;
};

export default ProductTags;
