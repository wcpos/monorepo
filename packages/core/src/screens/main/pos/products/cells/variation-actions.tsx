import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';

import { useAddVariation } from '../../hooks/use-add-variation';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export function ProductVariationActions({
	row,
}: CellContext<{ document: ProductVariationDocument }, 'actions'>) {
	const variation = row.original.document;
	const parentRow = row.getParentRow();
	const parent = parentRow?.original?.document;
	const { addVariation } = useAddVariation();

	/**
	 * TODO: move this to a helper function
	 */
	const metaData = React.useMemo(() => {
		return (variation.attributes ?? []).map((attribute) => {
			return {
				attr_id: attribute.id ?? 0,
				display_key: attribute.name,
				display_value: attribute.option,
			};
		});
	}, [variation]);

	/**
	 *
	 */
	return (
		<IconButton
			name="circlePlus"
			size="xl"
			onPress={() =>
				parent && addVariation(variation, parent as unknown as ProductDocument, metaData)
			}
			variant="success"
		/>
	);
}
