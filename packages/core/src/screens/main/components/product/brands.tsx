import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';

import type { CellContext } from '@tanstack/react-table';
import type { QueryStateActions } from '../../../../query';

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

	const meta = table.options.meta as unknown as {
		actions?: Pick<QueryStateActions<'products'>, 'setFilter'>;
		query?: {
			where(field: string): { elemMatch(value: { id: number }): { exec(): void } };
		};
	};

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
					onPress={() => {
						if (brand.id === undefined) return;
						if (meta.actions) {
							meta.actions.setFilter('brands', [brand.id]);
						} else {
							meta.query?.where('brands').elemMatch({ id: brand.id }).exec();
						}
					}}
				>
					<ButtonText numberOfLines={1} decodeHtml>
						{brand.name}
					</ButtonText>
				</ButtonPill>
			))}
		</HStack>
	);
}
