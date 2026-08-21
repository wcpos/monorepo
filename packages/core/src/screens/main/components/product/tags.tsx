import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import type { QueryStateActions } from '../../../../query';

/**
 *
 */
export function ProductTags({
	table,
	row,
}: CellContext<{ record: EngineRecord<'products'> }, 'tags'>) {
	const tags = useRecordField(row.original.record, (product) => product.payload.tags) || [];

	const meta = table.options.meta as unknown as {
		actions: Pick<QueryStateActions<'products'>, 'setFilter'>;
	};

	if (tags.length === 0) {
		return null;
	}

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<HStack className="w-full flex-wrap gap-1">
			{tags.map((tag, index) => {
				return (
					<ButtonPill
						key={index}
						size="xs"
						variant="ghost-secondary"
						onPress={() =>
							tag.id === undefined ? undefined : meta.actions.setFilter('tags', [tag.id])
						}
					>
						<ButtonText numberOfLines={1} decodeHtml>
							{tag.name}
						</ButtonText>
					</ButtonPill>
				);
			})}
		</HStack>
	);
}
