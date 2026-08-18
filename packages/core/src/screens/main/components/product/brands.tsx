import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import type { QueryStateActions } from '../../../../query';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function ProductBrands({
	table,
	row,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'brands'>) {
	const brands = useRecordField(row.original.record, (product) => product.payload.brands) || [];

	const meta = table.options.meta as unknown as {
		actions: Pick<QueryStateActions<'products'>, 'setFilter'>;
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
					onPress={() =>
						brand.id === undefined ? undefined : meta.actions.setFilter('brands', [brand.id])
					}
				>
					<ButtonText numberOfLines={1} decodeHtml>
						{brand.name}
					</ButtonText>
				</ButtonPill>
			))}
		</HStack>
	);
}
