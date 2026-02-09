import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function ProductBrands({
	table,
	row,
}: CellContext<{ document: ProductDocument }, 'brands'>) {
	const product = row.original.document;
	const brands = useObservableEagerState(product.brands$!) || [];

	const query = (table.options.meta as unknown as { query: any })?.query;

	if (brands.length === 0) {
		return null;
	}

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 */
	return (
		<HStack className="w-full flex-wrap gap-1">
			{(brands || []).map((brand, index) => (
				<ButtonPill
					variant="ghost-primary"
					size="xs"
					key={index}
					onPress={() => query.where('brands').elemMatch({ id: brand.id }).exec()}
				>
					<ButtonText numberOfLines={1} decodeHtml>
						{brand.name}
					</ButtonText>
				</ButtonPill>
			))}
		</HStack>
	);
}
