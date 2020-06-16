import React from 'react';
import Button from '../../../../components/button';
import Popover from '../../../../components/popover';
import Variations from './variations';

interface Props {
	product: any;
	addToCart: any;
}

const Actions: React.FC<Props> = ({ product, addToCart }) => {
	if (product.isVariable()) {
		return (
			<Popover content={<Variations product={product} addToCart={addToCart} />}>
				<Button title="->" />
			</Popover>
		);
	}

	return (
		<Button
			title="+"
			onPress={() => {
				addToCart(product);
			}}
		/>
	);
};

export default Actions;
