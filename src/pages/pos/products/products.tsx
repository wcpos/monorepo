import React from 'react';
import { View, Text } from 'react-native';
import Icon from '../../../components/icon';

interface Props {}

const Products: React.FC<Props> = () => {
	return (
		<>
			<Text>Products</Text>
			<Icon name="check" />
		</>
	);
};

export default Products;
