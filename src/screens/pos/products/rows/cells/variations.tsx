import * as React from 'react';
import { View } from 'react-native';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';
import Button from '@wcpos/common/src/components/button';
import Select from '@wcpos/common/src/components/select';
import { usePOSContext } from '../../../context';

type ProductVariationDocument = import('@wcpos/common/src/database').ProductVariationDocument;

interface Props {
	variationsResource: ObservableResource<ProductVariationDocument[]>;
}

const Variations = ({ variationsResource }: Props) => {
	const { currentOrder } = usePOSContext();
	const [variation, setVariation] = React.useState();
	const variations = useObservableSuspense(variationsResource);

	const addToCart = React.useCallback(async () => {
		if (currentOrder && variation) {
			currentOrder.addOrUpdateLineItem(variation);
		}
	}, [currentOrder, variation]);

	return (
		<>
			{variations.map((product) => (
				<View key={product.id}>
					<Text>
						{product.id} -{product.name}
					</Text>
					{/* <Button title="Add to Cart" onPress={() => addToCart(product)} /> */}
				</View>
			))}
		</>
	);
};

export default Variations;
