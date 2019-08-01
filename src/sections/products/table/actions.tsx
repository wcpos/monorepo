import React, { Fragment } from 'react';
import Button from '../../../components/button';
import Product from '../../../models/product/model';

type Props = {
	product: Product;
};

const Actions = ({ product }: Props) => {
	const handleDelete = () => {
		product.destroyPermanently();
	};

	const handleShow = () => {
		console.log('show modal');
	};

	return (
		<Fragment>
			<Button title="Delete" onPress={handleDelete} />
			<Button title="Show" onPress={handleShow} />
		</Fragment>
	);
};

export default Actions;
