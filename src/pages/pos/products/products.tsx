import React from 'react';
import { View, Text } from 'react-native';
import Icon from '../../../components/icon/icon2';

interface Props {}

const Products: React.FC<Props> = ({ header, main, title }) => {
	return (
		<>
			<Text>Products</Text>
			<Icon />
		</>
	);
};

export default Products;
