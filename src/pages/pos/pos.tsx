import React from 'react';
import { View, Text } from 'react-native';
import Products from './products';

interface Props {}

const POS: React.FC<Props> = () => {
	return (
		<View>
			<Products />
		</View>
	);
};

export default POS;
