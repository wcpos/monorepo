import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function ProductCategories({
	table,
	row,
}: CellContext<{ document: ProductDocument }, 'categories'>) {
	const product = row.original.document;
	const categories = useObservableEagerState(product.categories$!) || [];

	const query = (table.options.meta as unknown as { query: any })?.query;

	if (categories.length === 0) {
		return null;
	}

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 */
	return (
		<HStack className="w-full flex-wrap gap-1">
			{(categories || []).map((cat, index) => (
				<ButtonPill
					variant="ghost-primary"
					size="xs"
					key={index}
					onPress={() => query.where('categories').elemMatch({ id: cat.id }).exec()}
				>
					<ButtonText numberOfLines={1} decodeHtml>
						{cat.name}
					</ButtonText>
				</ButtonPill>
			))}
		</HStack>
	);
}
