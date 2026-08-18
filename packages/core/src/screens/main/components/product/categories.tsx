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
export function ProductCategories({
	table,
	row,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'categories'>) {
	const categories =
		useRecordField(row.original.record, (product) => product.payload.categories) || [];

	const meta = table.options.meta as unknown as {
		actions: Pick<QueryStateActions<'products'>, 'setFilter'>;
	};

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
					onPress={() =>
						cat.id === undefined ? undefined : meta.actions.setFilter('categories', [cat.id])
					}
				>
					<ButtonText numberOfLines={1} decodeHtml>
						{cat.name}
					</ButtonText>
				</ButtonPill>
			))}
		</HStack>
	);
}
