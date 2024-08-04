import * as React from 'react';

import { IconButton } from '@wcpos/tailwind/src/icon-button';

import { useAddVariation } from '../../hooks/use-add-variation';

interface Props {
	item: import('@wcpos/database').ProductVariationDocument;
	parent: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
export const ProductVariationActions = ({ item: variation, parent }: Props) => {
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
			size="xl"
			onPress={() => addVariation(variation, parent, metaData)}
			variant="success"
		/>
	);
};
