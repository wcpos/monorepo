import React from 'react';
import Text from '../../../../../../components/text';

interface Props {
	product: any;
	addToCart: any;
}

const Variations = ({ product, addToCart }: Props) => {
	// const variations = useObservable(product.variations.observe(), []);

	// variations.forEach((variation) => {
	// 	// if (variation && !variation.status) {
	// 	variation.fetch();
	// 	// }
	// });
	const variations = [];

	return variations.map((variation) => (
		<Text
			key={variation.id}
			onPress={() => {
				addToCart(variation);
			}}
		>
			{variation.remote_id} - {variation.price}
		</Text>
	));
};

export default Variations;
