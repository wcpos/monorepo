import * as React from 'react';
import useObservable from '../../../hooks/use-observable';
import Text from '../../../components/text';
import { Product } from '../../../database/models/types';

type Props = {
	product: Product;
};

const Tags = ({ product }: Props) => {
	const tags = useObservable(product.tags.observe(), []);

	const handleClick = tag => {
		console.log('filter by tag ', tag);
	};

	return tags.map(tag => (
		<Text key={tag.id} onPress={() => handleClick(tag)}>
			{tag.name}
		</Text>
	));
};

export default Tags;
