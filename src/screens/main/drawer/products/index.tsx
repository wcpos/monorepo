import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import EditProduct from './edit-product';
import Products from './products';
import { ProductsProvider } from '../../../../contexts/products';
import { ModalLayout } from '../../../components/modal-layout';

export type ProductsStackParamList = {
	Products: undefined;
	EditProduct: { productID: string };
};

const Stack = createStackNavigator<ProductsStackParamList>();

/**
 *
 */
const ProductsNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Products" component={Products} />
			<Stack.Screen
				name="EditProduct"
				component={({ route }) => {
					const { productID } = route.params;
					return (
						<ProductsProvider initialQuery={{ filters: { uuid: productID } }}>
							<ModalLayout>
								<EditProduct />
							</ModalLayout>
						</ProductsProvider>
					);
				}}
				options={{ presentation: 'transparentModal' }}
			/>
		</Stack.Navigator>
	);
};

export default ProductsNavigator;
