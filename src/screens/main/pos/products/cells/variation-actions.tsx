import * as React from 'react';
import { View } from 'react-native';

import Icon from '@wcpos/components/src/icon';

import useCurrentOrder from '../../contexts/current-order';

interface Props {
	item: import('@wcpos/database').ProductVariationDocument;
	parent: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
export const ProductVariationActions = ({ item: variation, parent }: Props) => {
	const { addVariation } = useCurrentOrder();

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
		<Icon
			name="circlePlus"
			size="xxLarge"
			onPress={() => addVariation(variation, parent, metaData)}
			type="success"
		/>
	);
};
