import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { useDataTable } from '@wcpos/components/data-table';
import { HStack } from '@wcpos/components/hstack';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const ProductTags = ({ row }: CellContext<{ document: ProductDocument }, 'tags'>) => {
	const product = row.original.document;
	const tags = useObservableEagerState(product.tags$) || [];
	const { query } = useDataTable();

	if (tags.length === 0) {
		return null;
	}

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<HStack className="flex-wrap gap-1 w-full">
			{tags.map((tag: any, index: number) => {
				return (
					<ButtonPill
						key={index}
						size="xs"
						variant="ghost-secondary"
						onPress={() => query.where('tags').elemMatch({ id: tag.id }).exec()}
					>
						<ButtonText numberOfLines={1} decodeHtml>
							{tag.name}
						</ButtonText>
					</ButtonPill>
				);
			})}
		</HStack>
	);
};
