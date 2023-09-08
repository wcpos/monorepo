import * as React from 'react';

import Pill from '@wcpos/components/src/pill';
import { useTable } from '@wcpos/components/src/table';

type ProductTagsProps = {
	item: import('@wcpos/database').ProductDocument;
};

const ProductTags = ({ item: product }: ProductTagsProps) => {
	const { tags } = product;
	const query = useTable();

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
