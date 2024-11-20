import * as React from 'react';

import { IconButton } from '@wcpos/components/src/icon-button';

import { useAddVariation } from '../../hooks/use-add-variation';

import type { CellContext } from '@tanstack/react-table';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export const ProductVariationActions = ({
	row,
}: CellContext<{ document: ProductVariationDocument }, 'actions'>) => {
	const variation = row.original.document;
	const parent = row.getParentRow().document;
	const { addVariation } = useAddVariation();

	/**
	 * TODO: move this to a helper function
	 */
	const metaData = React.useMemo(() => {
		return variation.attributes.map((attribute) => {
			return {
				attr_id: attribute.id,
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
			size="4xl"
			onPress={() => addVariation(variation, parent, metaData)}
			variant="success"
		/>
	);
};
