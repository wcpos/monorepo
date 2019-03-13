import React from 'react';
import { View } from 'react-native';
import Products from './products';
import Cart from './cart';
import ErrorBoundary from '../../components/error';

interface Props {
	navigation: any;
	t: any;
}

const POS = () => {
	return (
		<View style={{ flexDirection: 'row' }}>
			<View style={{ flex: 1 }}>
				<ErrorBoundary>
					<Products />
				</ErrorBoundary>
			</View>
			<View style={{ flex: 1 }}>
				<ErrorBoundary>
					<Cart />
				</ErrorBoundary>
			</View>
		</View>
	);
};

export default POS;
