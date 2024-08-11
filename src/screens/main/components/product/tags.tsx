import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import { useTable } from '@wcpos/tailwind/src/table';

type ProductTagsProps = {
	item: import('@wcpos/database').ProductDocument;
};

/**
 *
 */
export const ProductTags = ({ item: product }: ProductTagsProps) => {
	const { tags } = product;
	const query = useTable();

	/**
	 *
	 */
	return tags.map((tag: any) => {
		return (
			<ButtonPill
				key={tag.id}
				size="xs"
				onPress={() => query.where('tags', { $elemMatch: { id: tag.id } })}
			>
				<ButtonText>{tag.name}</ButtonText>
			</ButtonPill>
		);
	});
};
