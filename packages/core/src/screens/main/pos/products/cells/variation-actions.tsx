import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';
import type { CellContext } from '@wcpos/core/table-types';

import { useAddVariation } from '../../hooks/use-add-variation';
import { useT } from '../../../../../contexts/translations';

type Attributes = import('@wcpos/query').VariationPayload['attributes'];

/**
 *
 */
export function ProductVariationActions({
	row,
}: CellContext<{ record: EngineRecord<'variations'> }, 'actions'>) {
	const t = useT();
	const variation = row.original.record;
	const attributes = useRecordField(variation, (record) => record.payload.attributes);
	const parentRow = row.getParentRow();
	const parent = parentRow?.original?.record as EngineRecord<'products'> | undefined;
	const { addVariation } = useAddVariation();

	/**
	 * TODO: move this to a helper function
	 */
	const metaData = React.useMemo(() => {
		const sanitizedAttributes = sanitizeVariationAttributesRead(attributes) as Attributes;
		return (sanitizedAttributes ?? []).map((attribute) => {
			return {
				attr_id: attribute.id ?? 0,
				display_key: attribute.name,
				display_value: attribute.option,
			};
		});
	}, [attributes]);

	/**
	 *
	 */
	return (
		<IconButton
			testID="add-variation-to-cart-button"
			name="circlePlus"
			size="4xl"
			accessibilityLabel={t('common.add_to_cart')}
			onPress={() => parent && addVariation(variation, parent, metaData)}
			variant="success"
		/>
	);
}
