import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

import type { QueryStateActions } from '../../../../query';

/**
 *
 */
export function ProductTags({
	table,
	row,
}: CellContext<{ record: EngineRecord<'products'> }, 'tags'>) {
	const tags = useRecordField(row.original.record, (product) => product.payload.tags) || [];

	const t = useT();
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
		<Text className="w-full text-sm" numberOfLines={1}>
			<Text className="text-muted-foreground">{t('common.tags')} </Text>
			{tags.map((tag, index) => (
				<React.Fragment key={index}>
					{index > 0 && ', '}
					<Text
						className="text-foreground text-sm"
						accessibilityRole="button"
						decodeHtml
						onPress={() =>
							tag.id === undefined ? undefined : meta.actions.setFilter('tags', [tag.id])
						}
					>
						{tag.name}
					</Text>
				</React.Fragment>
			))}
		</Text>
	);
}
