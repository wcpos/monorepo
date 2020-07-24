import React from 'react';
import useObservable from '../../../hooks/use-observable';
import Text from '../../../components/text';
import { Product } from '../../../database/models/types';

type Props = {
	product: Product;
};

const Categories = ({ product }: Props) => {
	const categories = useObservable(product.categories.observe(), []);

	const handleClick = category => {
		console.log('filter by cat ', category);
	};

	return categories.map(category => (
		<Text key={category.id} onPress={() => handleClick(category)}>
			{category.name}
		</Text>
	));
};

export default Categories;
