import React from 'react';
import Text from '../../../../components/text';
import useObservable from '../../../../hooks/use-observable';

interface Props {
	product: any;
	addToCart: any;
}

const Variations = ({ product, addToCart }: Props) => {
	const variations = useObservable(product.variations.observe(), []);

	variations.forEach(variation => {
		if (variation && !variation.status) {
			variation.fetch();
		}
	});

	return variations.map(variation => (
		<Text>
			{variation.remote_id} - {variation.price}
		</Text>
	));
};

export default Variations;
