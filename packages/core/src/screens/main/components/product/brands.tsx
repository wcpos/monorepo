import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

/**
 *
 */
export function ProductBrands({
	table,
	row,
}: CellContext<{ record: EngineRecord<'products'> }, 'brands'>) {
	const brands = useRecordField(row.original.record, (product) => product.payload.brands) || [];

	const t = useT();
	const actions = table.options.meta?.actions;

	if (brands.length === 0) {
		return null;
	}

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 */
	return (
		<Text className="w-full text-sm" numberOfLines={1}>
			<Text className="text-muted-foreground">{t('common.brands')} </Text>
			{brands.map((brand, index) => (
				<React.Fragment key={index}>
					{index > 0 && ', '}
					<Text
						className="text-foreground text-sm"
						accessibilityRole="button"
						decodeHtml
						onPress={() =>
							brand.id === undefined ? undefined : actions?.setFilter('brands', [brand.id])
						}
					>
						{brand.name}
					</Text>
				</React.Fragment>
			))}
		</Text>
	);
}
