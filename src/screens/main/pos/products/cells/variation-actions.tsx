import * as React from 'react';
import { View } from 'react-native';

import Icon from '@wcpos/components/src/icon';

import useCartHelpers from '../../../hooks/use-cart-helpers';

interface Props {
	item: import('@wcpos/database').ProductVariationDocument;
}

/**
 *
 */
export const ProductVariationActions = ({ item: variation, parent }: Props) => {
	const { addVariation } = useCartHelpers();

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
