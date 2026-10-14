import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import type { QueryStateActions } from '../../../../query';

/**
 *
 */
export function ProductCategories({
	table,
	row,
}: CellContext<{ record: EngineRecord<'products'> }, 'categories'>) {
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
		<Text className="w-full text-sm" numberOfLines={1}>
			{categories.map((cat, index) => (
				<React.Fragment key={index}>
					{index > 0 && ', '}
					<Text
						className="text-foreground text-sm"
						accessibilityRole="button"
						decodeHtml
						onPress={() =>
							cat.id === undefined ? undefined : meta.actions.setFilter('categories', [cat.id])
						}
					>
						{cat.name}
					</Text>
				</React.Fragment>
			))}
		</Text>
	);
}
