import React from 'react';
import { View } from 'react-native';
import Products from './products';
import Cart from './cart';
import ErrorBoundary from '../../components/error';
import useUI from '../../hooks/use-ui';

const POS = () => {
	const ui: any = useUI('pos_products');

	return (
		<View style={{ flexDirection: 'row', height: '100%' }}>
			<View style={{ flex: 1, paddingRight: 5 }}>
				<ErrorBoundary>
					<Products ui={ui} />
				</ErrorBoundary>
			</View>
			<View style={{ flex: 1, paddingLeft: 5 }}>
				<ErrorBoundary>
					<Cart />
				</ErrorBoundary>
			</View>
		</View>
	);
};

export default POS;
